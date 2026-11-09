# M7 incident response and integrated demonstration

## Before acting

Monitoring is advisory. Dismissing an incident, disabling an app agent or revoking offchain consent cannot pause a contract, reverse a payment or release an unknown obligation. The retained vault FullAccess key can bypass contract controls; see ../../VAULT_GOVERNANCE.md. No M7 workflow creates signing keys, broadcasts from a server or grants financial authority to administrators. Public Testnet deployment and transactions require separate authorization.

Open `/workspace/security` at the configured trusted origin (local HTTPS: `https://127.0.0.1:8443/workspace/security`). Select your organization. Active members can inspect; existing owner/admin roles can acknowledge, self-assign, investigate and resolve/dismiss with a predefined reason. A stale-version response requires refreshing. Read-only roles cannot escalate.

Alerts are available **in this dashboard only**. There is no email/push delivery and no claim an owner was contacted. Inspect source references and timestamps: thresholds and RPC mismatches are not independent proof of an attack. Unscoped auth/operational alerts are not tenant records. A trusted local operator can run `pnpm security:status` for aggregate global indicators and worker timestamps without tenant details or credentials.

## Triage and containment

1. Acknowledge and assign the incident to yourself; begin investigation. Read the explanation, occurrence count, evidence references and settlement health.
2. For suspect agent access, review application access removal. Owner/admin may disable an agent. Only the original mandate owner with active owner role may revoke its capability. Confirm the existing API response and refresh. This is offchain containment only.
3. Follow **Review wallet-authorized pause** to the existing settlement review, with mandate/action selected. Navigation never opens a transaction automatically. Check signer, network, vault, immutable policy and exact arguments.
4. Original owner may pause, resume when allowed or terminally revoke. A guardian with active organization access can pause only when finalized deployment and exact mandate state bind that wallet as guardian. This is rechecked before prompting. A guardian without app membership retains direct contract authority through a separately reviewed wallet procedure; never infer app membership from a client field.
5. Only after separate Testnet authorization, approve the exact transaction in the actual permitted wallet. Sessions and incident assignments are not signatures. A prompt attempt, claimed hash or cancellation is not finality.
6. Refresh verified settlement state and receipts. A finalized operation proves that action's outcome, not that no later action changed the current mandate. Dispatched transfers can settle after pause/revoke.
7. For missing/failed callbacks, unknown broadcasts or conflicting receipts: preserve quarantine. Never rebroadcast, delete/reset an intent to sign again, or release reserved funds because time passed. Investigate provider history and contract state read-only.
8. Record a resolution reason only when the relevant evidence supports it. Incident resolution changes no financial state. Late observations remain in history; new five-minute windows may create new alerts.

For wallet/deployment-key compromise: stop new signing, use a trusted device and official wallet recovery guidance, and contact the actual owner through an authorized channel. Obtain separate reviewed authorization for key changes. Never request recovery phrases/private keys. Contract pause cannot stop a FullAccess key from replacing code or transferring account funds. There is no force-settlement, master withdrawal or implicit migration.

## Outages, recovery and evidence

- Health is process liveness. Worker readiness fails on DB loss or either loop remaining stale for six minutes. Dashboard warns after a missing/older-than-one-minute heartbeat; a long RPC scan may therefore warn while progressing.
- Monitoring uses a separate bounded pool/loop and cannot gate reconciliation. DB loss affects both; retained source rows replay after recovery. No database can persist events during its own outage, and a stopped process cannot page its owner. External liveness observation/human response remain necessary.
- Restore using `docker compose -f compose.yaml -f compose.https.yaml up -d --wait`. Retain the PostgreSQL volume and certificates; never use `down -v`.
- Run `pnpm test:smoke`, `pnpm test:database`, `pnpm test:https`, `pnpm security:status`. Do not bypass TLS, Origin or CSRF checks.
- Deployment probes require a complete approved manifest, independent of the new-submission enable flag. With new submissions disabled, monitoring continues and retained M6 intents still reconcile against their stored manifests. No manifest means no deployed-readiness claim.
- Evidence: incident/rule/classification/source IDs, timestamps, actual public finalized block/receipt references, observed state and corrective action. Exclude cookies, signatures, capability values, wallet secrets and sensitive documents.

## Demonstration sequence — M8 live acceptance pending

Development evidence consists of distinct automated components: real local M3 sandbox payment/accounting; real PostgreSQL agent API oversized rejection creating PREFLIGHT_REJECTED and SPENDING_LIMIT; browser incident inspection and pause-review navigation; sandbox owner/guardian pause with unauthorized execution/resume/revoke rejection; and M6 sandbox-to-TypeScript receipt verification. Fixtures and sandbox hashes are **not** public Testnet demonstration evidence.

For judges, obtain the separate M6 deployment/funding/gas authorization and verify artifact/key governance. Use genuine independent-source/verifier approvals and real Testnet wallets: permitted payment → oversized app proposal rejection → generated incident → owner inspection → actual wallet pause → finalized pause receipt/state → separately gas-authorized rejected execution after pause. Capture authentic public references. Never manufacture an unknown transfer or reissue funds to make the demonstration work. Physical Android and complete desktop/verifier flows belong to integrated M8; iOS remains deferred. No repetitive owner-operated M7 walkthrough is requested.
