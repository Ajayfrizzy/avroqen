# Operations, monitoring and incident response

## Environments
Local and sandbox first; isolated testnet demo; mainnet only after independent review, explicit human authorization and a separate deployment plan. Store secrets in ignored env files or approved secret stores, not GitHub, docs, screenshots or logs.

## Monitoring
Index chain receipts and account state; detect failed/unknown callbacks, prolonged pending, replay attempts, suspicious proposal volume, rejected recipients, repeated invalid attestations, sudden verifier changes and reconciliation divergence. Distinguish alert rules (indicators) from guaranteed detection.

## Runbooks
- Suspected agent compromise: suspend relevant mandate onchain, revoke function-call key, freeze pending ops, collect immutable tx refs; review exposure.
- Suspected verifier compromise: revoke verifier privileges and affected mandates, require fresh independent approval.
- Backend outage: UI status becomes stale/unknown, no blind transaction retry; reconcile against chain after restore.
- Confirmed contract issue: pause if possible, advise owners, avoid false promises of rollback, engage security review, propose owner-authorized migration.
- Financial discrepancy: halt new reservations, compare contract state and chain receipts, avoid altering read models to conceal discrepancy.

## Operational safety
No customer money before independent professional security review; demo funds must be limited to free testing tokens. Backups, audit-log access control, data retention, minimal personally identifiable evidence. Publish known limitations and reproducible demo instructions.
