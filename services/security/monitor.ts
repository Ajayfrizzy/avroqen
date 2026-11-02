import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { rulesFor, safeReason, WINDOW_MS } from "./rules.js";

const sources = {
  audit: `SELECT id::text,org_id,NULL::uuid AS mandate_id,COALESCE(actor_account,'authentication') AS subject,event AS event_type,CASE WHEN event='access_denied' THEN 'OTHER' ELSE reason END AS reason,occurred_at FROM security_audit_records`,
  agent: `SELECT e.id::text,p.org_id,p.id AS mandate_id,p.agent_id::text AS subject,e.event AS event_type,e.reason,e.occurred_at FROM agent_events e JOIN mandate_policies p ON p.id=e.mandate_id`,
  mandate: `SELECT e.id::text,p.org_id,p.id AS mandate_id,e.actor_account AS subject,e.event AS event_type,'OFFCHAIN_ONLY' AS reason,e.occurred_at FROM mandate_events e JOIN mandate_policies p ON p.id=e.mandate_id`,
  evidence: `SELECT e.id::text,p.org_id,p.id AS mandate_id,e.actor_account AS subject,e.event AS event_type,COALESCE(r.status,'OFFCHAIN_ONLY') AS reason,e.occurred_at FROM evidence_events e JOIN evidence_submissions s ON s.id=e.evidence_id JOIN agent_proposals a ON a.id=s.proposal_id JOIN mandate_policies p ON p.id=a.mandate_id LEFT JOIN evidence_reviews r ON r.id=e.review_id`,
  chain: `SELECT e.id::text,i.org_id,i.mandate_id,i.actor_account AS subject,e.state AS event_type,e.reason,e.occurred_at FROM chain_events e JOIN chain_intents i ON i.id=e.intent_id`,
  observation: `SELECT id,org_id,mandate_id,subject,event_type,reason,occurred_at FROM security_observations`,
};
export interface SourceEvent {
  id: string;
  org_id: string | null;
  mandate_id: string | null;
  subject: string;
  event_type: string;
  reason: string;
  occurred_at: Date;
}
async function project(db: pg.PoolClient, source: string, e: SourceEvent) {
  const inserted = await db.query(
    `INSERT INTO security_events(source,source_id,org_id,mandate_id,subject,event_type,reason,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id`,
    [
      source,
      e.id,
      e.org_id,
      e.mandate_id,
      e.subject,
      e.event_type,
      safeReason(e.reason),
      e.occurred_at,
    ],
  );
  if (!inserted.rowCount) return;
  const eventId = inserted.rows[0].id;
  const window = new Date(
    Math.floor(e.occurred_at.getTime() / WINDOW_MS) * WINDOW_MS,
  );
  for (const rule of rulesFor(e.event_type, safeReason(e.reason))) {
    const key = createHash("sha256")
      .update(
        JSON.stringify([
          rule.id,
          e.org_id,
          e.mandate_id,
          e.subject,
          window.toISOString(),
        ]),
      )
      .digest("hex");
    await db.query(
      "INSERT INTO security_rule_hits(event_id,rule,dedupe_key) VALUES($1,$2,$3)",
      [eventId, rule.id, key],
    );
    const count = (
      await db.query(
        `SELECT count(*)::int AS n,min(e.occurred_at) AS first,max(e.occurred_at) AS last FROM security_rule_hits h JOIN security_events e ON e.id=h.event_id WHERE h.dedupe_key=$1`,
        [key],
      )
    ).rows[0];
    if (count.n < rule.threshold) continue;
    const prior = (
      await db.query(
        "SELECT id FROM security_alerts WHERE dedupe_key=$1 FOR UPDATE",
        [key],
      )
    ).rows[0];
    const id = prior?.id ?? randomUUID();
    const result = prior
      ? await db.query(
          "UPDATE security_alerts SET occurrences=$2,first_observed=$3,last_observed=$4,version=version+1 WHERE id=$1 RETURNING version",
          [id, count.n, count.first, count.last],
        )
      : await db.query(
          `INSERT INTO security_alerts(id,dedupe_key,rule,severity,classification,explanation,org_id,mandate_id,subject,window_start,first_observed,last_observed,occurrences) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING version`,
          [
            id,
            key,
            rule.id,
            rule.severity,
            rule.classification,
            rule.explanation,
            e.org_id,
            e.mandate_id,
            e.subject,
            window,
            count.first,
            count.last,
            count.n,
          ],
        );
    await db.query(
      `INSERT INTO security_alert_evidence(alert_id,event_id) SELECT $1,event_id FROM security_rule_hits WHERE dedupe_key=$2 ON CONFLICT DO NOTHING`,
      [id, key],
    );
    await db.query(
      "INSERT INTO security_incident_history(alert_id,action,version) VALUES($1,$2,$3)",
      [id, prior ? "OBSERVED" : "DETECTED", result.rows[0].version],
    );
  }
}
export async function heartbeat(
  pool: pg.Pool,
  worker: "monitoring" | "reconciliation",
) {
  await pool.query(
    "INSERT INTO security_worker_health(worker,last_success) VALUES($1,clock_timestamp()) ON CONFLICT(worker) DO UPDATE SET last_success=EXCLUDED.last_success",
    [worker],
  );
}
export async function monitorOnce(pool: pg.Pool) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SET LOCAL statement_timeout='5s'");
    await db.query("SET LOCAL lock_timeout='1s'");
    if (
      !(await db.query("SELECT pg_try_advisory_xact_lock(413007) AS acquired"))
        .rows[0].acquired
    ) {
      await db.query("ROLLBACK");
      return 0;
    }
    let n = 0;
    for (const [source, sql] of Object.entries(sources)) {
      const result = await db.query<SourceEvent>(
        `SELECT s.* FROM (${sql}) s WHERE NOT EXISTS(SELECT 1 FROM security_events e WHERE e.source=$1 AND e.source_id=s.id) ORDER BY s.occurred_at,s.id LIMIT 100`,
        [source],
      );
      for (const e of result.rows) {
        await project(db, source, e);
        n++;
      }
    }
    await db.query(
      "INSERT INTO security_worker_health(worker,last_success) VALUES('monitoring',clock_timestamp()) ON CONFLICT(worker) DO UPDATE SET last_success=EXCLUDED.last_success",
    );
    await db.query("COMMIT");
    return n;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
// Only server call sites create observations; no user event ingestion API.
export async function observeInternal(
  db: pg.Pool | pg.PoolClient,
  e: {
    id: string;
    org?: string;
    mandate?: string;
    subject: string;
    type: string;
    reason: string;
  },
) {
  await db.query(
    "INSERT INTO security_observations(id,org_id,mandate_id,subject,event_type,reason) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
    [
      e.id,
      e.org ?? null,
      e.mandate ?? null,
      e.subject,
      e.type,
      safeReason(e.reason),
    ],
  );
}
export async function sampleLocalHealth(pool: pg.Pool) {
  await pool.query(`INSERT INTO security_observations(id,org_id,mandate_id,subject,event_type,reason)
 SELECT 'delay:'||id||':'||floor(extract(epoch FROM clock_timestamp())/300)::text,org_id,mandate_id,actor_account,'SETTLEMENT_DELAY','LONG_RUNNING'
 FROM chain_intents WHERE state NOT IN ('PREPARED','CONFIRMED_SUCCESS','CONFIRMED_FAILED') AND EXISTS(SELECT 1 FROM chain_events e WHERE e.intent_id=chain_intents.id AND e.state='AWAITING_WALLET' AND e.occurred_at<clock_timestamp()-interval '10 minutes')
 ORDER BY next_check,id LIMIT 100 ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO security_observations(id,subject,event_type,reason)
 SELECT 'worker:'||w||':'||floor(extract(epoch FROM clock_timestamp())/300)::text,w,'WORKER_HEALTH','WORKER_STALLED'
 FROM (VALUES('reconciliation'),('monitoring')) workers(w) WHERE NOT EXISTS(SELECT 1 FROM security_worker_health WHERE worker=w AND last_success>clock_timestamp()-interval '1 minute') ON CONFLICT DO NOTHING`);
}
