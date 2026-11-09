import type pg from "pg";
import {
  type Manifest,
  NearReader,
  readOnlyDeploymentConfig,
} from "../chain/rpc.js";
import { observeInternal } from "./monitor.js";
import { reserveWarning, safeFailure } from "./rules.js";
export async function probeDeployment(
  pool: pg.Pool,
  manifest: Manifest | null,
  reader = new NearReader(),
) {
  if (!manifest) return; // Absence of authorization is not an incident.
  const reasons: string[] = [];
  try {
    const d = await reader.deployment(manifest);
    if (reserveWarning(d.accounting)) reasons.push("LOW_RESERVE");
    const price = await reader.rpc("gas_price", { block_id: d.block.hash });
    const gas = (price as { gas_price?: unknown })?.gas_price;
    if (typeof gas !== "string" || !/^[0-9]{1,39}$/.test(gas))
      throw new Error("CONTRACT_UNAVAILABLE");
    if (BigInt(gas) > 200000000n) reasons.push("GAS_PRICE_ELEVATED");
  } catch (e) {
    reasons.push(safeFailure(e));
  }
  if (!reasons.length) return;
  const orgs = await pool.query(
    "SELECT DISTINCT org_id FROM mandate_policies WHERE network='testnet' AND canonical_policy::jsonb->>'vaultAccount'=$1 ORDER BY org_id LIMIT 100",
    [manifest.account],
  );
  const bucket = (
    await pool.query(
      "SELECT floor(extract(epoch FROM clock_timestamp())/300)::text AS bucket",
    )
  ).rows[0].bucket;
  for (const org of [null, ...orgs.rows.map((r) => r.org_id as string)])
    for (const reason of reasons) {
      await observeInternal(pool, {
        id: `deployment:${manifest.account}:${org ?? "global"}:${reason}:${bucket}`,
        ...(org ? { org } : {}),
        subject: manifest.account,
        type: "DEPLOYMENT_OBSERVATION",
        reason,
      });
    }
}

// Monitoring an approved manifest is independent of enabling new transactions.
export function monitoringManifest(env: NodeJS.ProcessEnv) {
  if (
    ![
      env.M6_VAULT_ACCOUNT,
      env.M6_WASM_SHA256,
      env.M6_KEY_FINGERPRINTS,
      env.M6_AUTHORIZATION_REFERENCE,
    ].some(Boolean)
  )
    return null;
  return readOnlyDeploymentConfig(env);
}
