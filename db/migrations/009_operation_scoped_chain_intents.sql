DROP INDEX chain_one_unresolved;

CREATE UNIQUE INDEX chain_one_unresolved_mandate
 ON chain_intents(actor_account,vault_account,mandate_id)
 WHERE state NOT IN ('CONFIRMED_SUCCESS','CONFIRMED_FAILED')
   AND replacement_authorized_at IS NULL;

-- Storage credit belongs to the signer rather than a mandate. These calls are
-- intentionally serialized because identical calls cannot be attributed by
-- mandate and withdrawals consume the same account-level resource.
CREATE UNIQUE INDEX chain_one_unresolved_storage_resource
 ON chain_intents(actor_account,vault_account)
 WHERE state NOT IN ('CONFIRMED_SUCCESS','CONFIRMED_FAILED')
   AND replacement_authorized_at IS NULL
   AND canonical_operation::jsonb->>'kind' IN ('STORAGE_DEPOSIT','WITHDRAW_STORAGE');

-- UNKNOWN and known-hash reconciliation must not permanently occupy the wallet.
-- Only the short-lived handoff itself is exclusive to avoid concurrent prompts
-- racing the wallet's access-key nonce selection.
CREATE UNIQUE INDEX chain_one_active_wallet_prompt
 ON chain_intents(actor_account,vault_account)
 WHERE state='AWAITING_WALLET';
