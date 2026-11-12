ALTER TABLE chain_intents ADD COLUMN replacement_authorized_at timestamptz;

DROP INDEX chain_one_unresolved;
CREATE UNIQUE INDEX chain_one_unresolved ON chain_intents(actor_account,vault_account)
 WHERE state NOT IN ('CONFIRMED_SUCCESS','CONFIRMED_FAILED') AND replacement_authorized_at IS NULL;

CREATE TABLE chain_recovery_challenges (
 id uuid PRIMARY KEY,
 original_intent_id uuid NOT NULL REFERENCES chain_intents(id),
 replacement_intent_id uuid NOT NULL UNIQUE,
 idempotency_key uuid NOT NULL,
 session_hash text NOT NULL REFERENCES auth_sessions(token_hash),
 actor_account text NOT NULL,
 origin text NOT NULL,
 nonce bytea NOT NULL UNIQUE CHECK(octet_length(nonce)=32),
 message text NOT NULL CHECK(octet_length(message)<=32768),
 evidence jsonb NOT NULL,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(expires_at>created_at),
 UNIQUE(original_intent_id,id)
);

CREATE TABLE chain_recoveries (
 id uuid PRIMARY KEY,
 original_intent_id uuid NOT NULL UNIQUE REFERENCES chain_intents(id),
 replacement_intent_id uuid NOT NULL UNIQUE REFERENCES chain_intents(id) DEFERRABLE INITIALLY DEFERRED,
 challenge_id uuid NOT NULL UNIQUE REFERENCES chain_recovery_challenges(id),
 actor_account text NOT NULL,
 public_key text NOT NULL,
 evidence jsonb NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION bind_chain_recovery_challenge() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.original_intent_id=NEW.replacement_intent_id OR NOT EXISTS(
   SELECT 1 FROM chain_intents original
   WHERE original.id=NEW.original_intent_id
     AND original.actor_account=NEW.actor_account
     AND original.state='UNKNOWN'
     AND original.reported_hash IS NULL
     AND original.verified_hash IS NULL
     AND original.replacement_authorized_at IS NULL
 ) THEN RAISE EXCEPTION 'chain recovery challenge binding'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bind_chain_recovery_challenge BEFORE INSERT ON chain_recovery_challenges FOR EACH ROW EXECUTE FUNCTION bind_chain_recovery_challenge();

CREATE FUNCTION bind_chain_recovery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(
   SELECT 1 FROM chain_recovery_challenges challenge
   JOIN chain_intents original ON original.id=challenge.original_intent_id
   WHERE challenge.id=NEW.challenge_id
     AND challenge.original_intent_id=NEW.original_intent_id
     AND challenge.replacement_intent_id=NEW.replacement_intent_id
     AND challenge.actor_account=NEW.actor_account
     AND challenge.consumed_at IS NOT NULL
     AND original.actor_account=NEW.actor_account
     AND original.state='UNKNOWN'
     AND original.reported_hash IS NULL
     AND original.verified_hash IS NULL
     AND original.replacement_authorized_at IS NULL
 ) THEN RAISE EXCEPTION 'chain recovery binding'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bind_chain_recovery BEFORE INSERT ON chain_recoveries FOR EACH ROW EXECUTE FUNCTION bind_chain_recovery();

CREATE FUNCTION protect_chain_recovery_challenge() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR
    (to_jsonb(NEW)-'consumed_at') IS DISTINCT FROM (to_jsonb(OLD)-'consumed_at') OR
    OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL
 THEN RAISE EXCEPTION 'immutable chain recovery challenge'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_chain_recovery_challenge BEFORE UPDATE OR DELETE ON chain_recovery_challenges FOR EACH ROW EXECUTE FUNCTION protect_chain_recovery_challenge();
CREATE TRIGGER chain_recoveries_immutable BEFORE UPDATE OR DELETE ON chain_recoveries FOR EACH ROW EXECUTE FUNCTION immutable_agent_record();

CREATE FUNCTION protect_chain_replacement_marker() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.replacement_authorized_at IS NOT NULL AND NEW.replacement_authorized_at IS DISTINCT FROM OLD.replacement_authorized_at
 THEN RAISE EXCEPTION 'immutable replacement authorization'; END IF;
 IF OLD.replacement_authorized_at IS NULL AND NEW.replacement_authorized_at IS NOT NULL AND
    NOT EXISTS(SELECT 1 FROM chain_recoveries WHERE original_intent_id=OLD.id)
 THEN RAISE EXCEPTION 'recovery evidence required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_chain_replacement_marker BEFORE UPDATE ON chain_intents FOR EACH ROW EXECUTE FUNCTION protect_chain_replacement_marker();
