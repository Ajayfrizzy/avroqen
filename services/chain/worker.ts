import type pg from "pg";
import type { IntentState } from "../../packages/domain/src/settlement.js";
import { type Intent, type Observation, observe } from "./reconcile.js";
import { NearReader } from "./rpc.js";
export async function runOnce(
  pool: pg.Pool,
  reader = new NearReader(),
): Promise<boolean> {
  const claimed = await pool.query(
    `UPDATE chain_intents SET lease_until=clock_timestamp()+interval '5 minutes' WHERE id=(SELECT id FROM chain_intents WHERE state NOT IN ('PREPARED','CONFIRMED_SUCCESS','CONFIRMED_FAILED') AND next_check<=clock_timestamp() AND (lease_until IS NULL OR lease_until<clock_timestamp()) ORDER BY next_check,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
  );
  const intent = claimed.rows[0] as
    | (Intent & { lease_until: Date })
    | undefined;
  if (!intent) return false;
  let result: Observation;
  try {
    result = await observe(reader, intent);
  } catch {
    result = { state: "UNKNOWN", reason: "RPC_OR_EVIDENCE_UNAVAILABLE" };
  }
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const row = (
      await db.query("SELECT * FROM chain_intents WHERE id=$1 FOR UPDATE", [
        intent.id,
      ])
    ).rows[0];
    if (
      !row ||
      new Date(row.lease_until).getTime() !== intent.lease_until.getTime() ||
      ["CONFIRMED_SUCCESS", "CONFIRMED_FAILED"].includes(row.state)
    ) {
      await db.query("ROLLBACK");
      return true;
    }
    // A browser may have supplied a hash while RPC was in flight. Retry with that new claim.
    if (row.reported_hash !== intent.reported_hash) {
      await db.query(
        "UPDATE chain_intents SET lease_until=NULL,next_check=clock_timestamp() WHERE id=$1",
        [intent.id],
      );
      await db.query("COMMIT");
      return true;
    }
    const state: IntentState = result.state;
    await db.query(
      `UPDATE chain_intents SET state=$2,reason=$3,verified_hash=COALESCE($4,verified_hash),reported_hash=COALESCE($5,reported_hash),receipt_ids=$6,last_height=COALESCE($7,last_height),last_block_hash=COALESCE($8,last_block_hash),scan_height=COALESCE($9,scan_height),scan_hash=COALESCE($10,scan_hash),lease_until=NULL,next_check=clock_timestamp()+interval '15 seconds',updated_at=clock_timestamp() WHERE id=$1`,
      [
        intent.id,
        state,
        result.reason,
        result.verifiedHash ?? null,
        result.reportedHash ?? null,
        JSON.stringify(result.receiptIds ?? []),
        result.height ?? null,
        result.blockHash ?? null,
        result.scanHeight ?? null,
        result.scanHash ?? null,
      ],
    );
    if (
      row.state !== state ||
      row.reason !== result.reason ||
      (result.blockHash && row.last_block_hash !== result.blockHash)
    )
      await db.query(
        "INSERT INTO chain_events(intent_id,state,reason,block_hash,receipt_ids) VALUES($1,$2,$3,$4,$5)",
        [
          intent.id,
          state,
          result.reason,
          result.blockHash ?? null,
          JSON.stringify(result.receiptIds ?? []),
        ],
      );
    await db.query("COMMIT");
  } catch {
    await db.query("ROLLBACK");
    throw new Error("RECONCILIATION_PERSISTENCE_FAILED");
  } finally {
    db.release();
  }
  return true;
}
