CREATE TABLE agent_credentials (
 id uuid PRIMARY KEY,
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 mandate_id uuid NOT NULL REFERENCES mandate_policies(id),
 issuer_account text NOT NULL,
 purpose text NOT NULL CHECK(purpose IN ('demo','operator')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 CHECK(purpose <> 'demo' OR expires_at <= created_at + interval '15 minutes'),
 CHECK(expires_at > created_at AND expires_at <= created_at + interval '24 hours')
);
CREATE INDEX agent_credentials_mandate ON agent_credentials(mandate_id);
CREATE TABLE agent_proposals (
 id uuid PRIMARY KEY,
 mandate_id uuid NOT NULL REFERENCES mandate_policies(id),
 idempotency_key uuid NOT NULL,
 canonical_payload text NOT NULL CHECK(octet_length(canonical_payload) <= 4096),
 status text NOT NULL DEFAULT 'SUBMITTED_OFFCHAIN' CHECK(status='SUBMITTED_OFFCHAIN'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(mandate_id,idempotency_key),
 CHECK(canonical_payload::jsonb->>'mandateId'=mandate_id::text),
 CHECK(canonical_payload::jsonb->>'proposalId'=id::text),
 CHECK(canonical_payload::jsonb->>'idempotencyKey'=idempotency_key::text)
);
CREATE TABLE agent_events (
 id uuid PRIMARY KEY,
 mandate_id uuid NOT NULL REFERENCES mandate_policies(id),
 credential_id uuid REFERENCES agent_credentials(id),
 proposal_id uuid REFERENCES agent_proposals(id),
 event text NOT NULL CHECK(event IN ('CREDENTIAL_ISSUED','CREDENTIAL_ROTATED','CREDENTIAL_REVOKED','PROPOSAL_SUBMITTED','PREFLIGHT_REJECTED')),
 reason text NOT NULL CHECK(reason ~ '^[A-Z_]{1,64}$'),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION immutable_agent_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable agent record'; END $$;
CREATE TRIGGER immutable_agent_proposal BEFORE UPDATE OR DELETE ON agent_proposals FOR EACH ROW EXECUTE FUNCTION immutable_agent_record();
CREATE TRIGGER immutable_agent_event BEFORE UPDATE OR DELETE ON agent_events FOR EACH ROW EXECUTE FUNCTION immutable_agent_record();
CREATE FUNCTION guard_agent_credential() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'retained credential'; END IF;
 IF (to_jsonb(NEW)-'revoked_at') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at') OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN RAISE EXCEPTION 'immutable credential scope'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_agent_credential BEFORE UPDATE OR DELETE ON agent_credentials FOR EACH ROW EXECUTE FUNCTION guard_agent_credential();

-- Scope is inherited from the immutable policy, never from caller-supplied labels.
CREATE FUNCTION validate_agent_proposal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p mandate_policies%ROWTYPE; j jsonb; terms jsonb; k text;
BEGIN
 SELECT * INTO STRICT p FROM mandate_policies WHERE id=NEW.mandate_id;
 j := NEW.canonical_payload::jsonb; terms := p.canonical_policy::jsonb;
 FOREACH k IN ARRAY ARRAY['organizationId','agentId','agentAccount','mandateId','policyVersion','network','vaultAccount','recipient','asset'] LOOP
  IF j->>k IS DISTINCT FROM terms->>k THEN RAISE EXCEPTION 'proposal scope mismatch'; END IF;
 END LOOP;
 IF j->>'policyDigest' IS DISTINCT FROM p.policy_digest OR j->>'schemaVersion' IS DISTINCT FROM '1'
 OR j->>'amountAtomic' IS NULL OR j->>'amountAtomic' !~ '^[1-9][0-9]{0,38}$'
 OR (j->>'amountAtomic')::numeric > 340282366920938463463374607431768211455
 OR (j->>'amountAtomic')::numeric > (terms->>'maxPerPaymentAtomic')::numeric
 OR j->>'evidenceDigest' IS NULL OR j->>'evidenceDigest' !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'invalid proposal'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_agent_proposal BEFORE INSERT ON agent_proposals FOR EACH ROW EXECUTE FUNCTION validate_agent_proposal();
CREATE FUNCTION validate_agent_issuer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_account_value text;
BEGIN
 SELECT owner_account INTO STRICT owner_account_value FROM mandate_policies WHERE id=NEW.mandate_id;
 IF NEW.issuer_account IS DISTINCT FROM owner_account_value THEN RAISE EXCEPTION 'invalid issuer'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_agent_issuer BEFORE INSERT ON agent_credentials FOR EACH ROW EXECUTE FUNCTION validate_agent_issuer();
