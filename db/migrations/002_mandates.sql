-- Offchain intent only. No chain transactions or financial ledger are created.
ALTER TABLE registered_agents ADD CONSTRAINT registered_agents_scope UNIQUE (id,org_id,network,near_account);
CREATE TABLE mandate_policies (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  network text NOT NULL CHECK (network IN ('testnet','mainnet')),
  owner_account text NOT NULL,
  agent_id uuid NOT NULL,
  agent_account text NOT NULL,
  canonical_policy text NOT NULL CHECK (octet_length(canonical_policy) <= 8192),
  policy_digest text NOT NULL CHECK (policy_digest ~ '^[0-9a-f]{64}$'),
  expires_at_ns numeric(20,0) NOT NULL CHECK (expires_at_ns > 0 AND expires_at_ns <= 18446744073709551615),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, org_id, network),
  FOREIGN KEY (org_id, network) REFERENCES organizations(id, network),
  FOREIGN KEY (agent_id, org_id, network, agent_account) REFERENCES registered_agents(id, org_id, network, near_account),
  CHECK (canonical_policy::jsonb->>'mandateId' = id::text),
  CHECK (canonical_policy::jsonb->>'organizationId' = org_id::text),
  CHECK (canonical_policy::jsonb->>'network' = network),
  CHECK (canonical_policy::jsonb->>'ownerAccount' = owner_account),
  CHECK (canonical_policy::jsonb->>'agentId' = agent_id::text),
  CHECK (canonical_policy::jsonb->>'agentAccount' = agent_account),
  CHECK ((canonical_policy::jsonb->>'expiresAtNs')::numeric = expires_at_ns)
);
CREATE TABLE mandate_consents (
  mandate_id uuid PRIMARY KEY REFERENCES mandate_policies(id),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','CONSENT_APPROVED_OFFCHAIN','CONSENT_REVOKED_OFFCHAIN')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE mandate_challenges (
  id uuid PRIMARY KEY,
  mandate_id uuid NOT NULL REFERENCES mandate_policies(id),
  session_hash text NOT NULL REFERENCES auth_sessions(token_hash),
  action text NOT NULL CHECK (action IN ('APPROVE_CONSENT','REVOKE_CONSENT')),
  origin text NOT NULL,
  nonce bytea NOT NULL UNIQUE CHECK (octet_length(nonce) = 32),
  message text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (expires_at > created_at)
);
CREATE TABLE mandate_events (
  id uuid PRIMARY KEY,
  mandate_id uuid NOT NULL REFERENCES mandate_policies(id),
  event text NOT NULL CHECK (event IN ('DRAFT_CREATED','CHALLENGE_ISSUED','APPROVE_CONSENT','REVOKE_CONSENT')),
  actor_account text NOT NULL,
  policy_digest text NOT NULL CHECK (policy_digest ~ '^[0-9a-f]{64}$'),
  challenge_id uuid REFERENCES mandate_challenges(id),
  public_key text,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX mandate_action_once ON mandate_events(mandate_id,event) WHERE event IN ('APPROVE_CONSENT','REVOKE_CONSENT');
CREATE INDEX mandate_org ON mandate_policies(org_id,network,id);
CREATE FUNCTION m2_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable M2 record'; END;
$$;
CREATE TRIGGER mandate_policy_immutable BEFORE UPDATE OR DELETE ON mandate_policies FOR EACH ROW EXECUTE FUNCTION m2_immutable();
CREATE TRIGGER mandate_events_append_only BEFORE UPDATE OR DELETE ON mandate_events FOR EACH ROW EXECUTE FUNCTION m2_immutable();
CREATE FUNCTION m2_consent_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.mandate_id <> NEW.mandate_id OR NOT (
    (OLD.status='DRAFT' AND NEW.status IN ('CONSENT_APPROVED_OFFCHAIN','CONSENT_REVOKED_OFFCHAIN')) OR
    (OLD.status='CONSENT_APPROVED_OFFCHAIN' AND NEW.status='CONSENT_REVOKED_OFFCHAIN')
  ) THEN RAISE EXCEPTION 'invalid consent transition'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mandate_consent_transition BEFORE UPDATE ON mandate_consents FOR EACH ROW EXECUTE FUNCTION m2_consent_transition();
CREATE TRIGGER mandate_consent_no_delete BEFORE DELETE ON mandate_consents FOR EACH ROW EXECUTE FUNCTION m2_immutable();
