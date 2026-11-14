CREATE TABLE chain_intents (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id),
 mandate_id uuid NOT NULL REFERENCES mandate_policies(id), actor_account text NOT NULL,
 network text NOT NULL CHECK(network='testnet'), vault_account text NOT NULL,
 idempotency_key uuid NOT NULL, canonical_operation text NOT NULL CHECK(octet_length(canonical_operation)<=16384),
 state text NOT NULL DEFAULT 'PREPARED' CHECK(state IN ('PREPARED','AWAITING_WALLET','BROADCAST_REPORTED','SUBMITTED','FINALIZING','UNKNOWN','CONFIRMED_SUCCESS','CONFIRMED_FAILED')),
 manifest jsonb NOT NULL, anchor_height bigint NOT NULL, anchor_hash text NOT NULL,
 scan_height bigint NOT NULL, scan_hash text NOT NULL,
 reported_hash text, verified_hash text UNIQUE,
 last_height bigint, last_block_hash text, receipt_ids jsonb NOT NULL DEFAULT '[]',
 reason text NOT NULL DEFAULT 'UNSIGNED', lease_until timestamptz,
 next_check timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(actor_account,idempotency_key),
 CHECK(canonical_operation::jsonb->>'signerId'=actor_account),
 CHECK(canonical_operation::jsonb->>'receiverId'=vault_account),
 CHECK(canonical_operation::jsonb->>'network'=network),
 CHECK(canonical_operation::jsonb->>'mandateId'=mandate_id::text)
);
CREATE UNIQUE INDEX chain_one_unresolved ON chain_intents(actor_account,vault_account) WHERE state NOT IN ('CONFIRMED_SUCCESS','CONFIRMED_FAILED');
CREATE TABLE chain_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,intent_id uuid NOT NULL REFERENCES chain_intents(id),
 state text NOT NULL,reason text NOT NULL,block_hash text,receipt_ids jsonb NOT NULL DEFAULT '[]',
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_chain_event BEFORE UPDATE OR DELETE ON chain_events FOR EACH ROW EXECUTE FUNCTION immutable_agent_record();
CREATE FUNCTION protect_chain_binding() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id OR NEW.mandate_id IS DISTINCT FROM OLD.mandate_id OR NEW.actor_account IS DISTINCT FROM OLD.actor_account OR NEW.network IS DISTINCT FROM OLD.network OR NEW.vault_account IS DISTINCT FROM OLD.vault_account OR NEW.canonical_operation IS DISTINCT FROM OLD.canonical_operation OR NEW.manifest IS DISTINCT FROM OLD.manifest OR NEW.anchor_height IS DISTINCT FROM OLD.anchor_height OR NEW.anchor_hash IS DISTINCT FROM OLD.anchor_hash OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN RAISE EXCEPTION 'immutable chain intent'; END IF;
 IF OLD.state IN ('CONFIRMED_SUCCESS','CONFIRMED_FAILED') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'terminal chain intent'; END IF;
 IF NEW.scan_height<OLD.scan_height OR (NEW.last_height IS NOT NULL AND OLD.last_height IS NOT NULL AND NEW.last_height<OLD.last_height) THEN RAISE EXCEPTION 'stale chain observation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_chain_binding BEFORE UPDATE ON chain_intents FOR EACH ROW EXECUTE FUNCTION protect_chain_binding();
CREATE FUNCTION bind_chain_tenant() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE p mandate_policies%ROWTYPE; BEGIN
 SELECT * INTO STRICT p FROM mandate_policies WHERE id=NEW.mandate_id;
 IF NEW.org_id<>p.org_id OR NEW.network<>p.network OR NEW.canonical_operation::jsonb->>'policyDigest' IS DISTINCT FROM p.policy_digest OR NEW.vault_account IS DISTINCT FROM p.canonical_policy::jsonb->>'vaultAccount' THEN RAISE EXCEPTION 'chain tenant binding'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER bind_chain_tenant BEFORE INSERT ON chain_intents FOR EACH ROW EXECUTE FUNCTION bind_chain_tenant();
