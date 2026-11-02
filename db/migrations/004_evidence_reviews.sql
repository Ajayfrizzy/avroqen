CREATE TABLE evidence_submissions (
 id uuid PRIMARY KEY, proposal_id uuid NOT NULL UNIQUE REFERENCES agent_proposals(id),
 canonical_metadata text NOT NULL CHECK(octet_length(canonical_metadata)<=2048),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE evidence_challenges (
 id uuid PRIMARY KEY, evidence_id uuid NOT NULL REFERENCES evidence_submissions(id),
 session_hash text NOT NULL REFERENCES auth_sessions(token_hash), actor_account text NOT NULL,
 canonical_review text NOT NULL CHECK(octet_length(canonical_review)<=4096),
 canonical_payload text NOT NULL CHECK(octet_length(canonical_payload)<=4096),
 nonce bytea NOT NULL UNIQUE CHECK(octet_length(nonce)=32), message text NOT NULL,
 origin text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL, consumed_at timestamptz,
 CHECK(expires_at>created_at)
);
CREATE TABLE evidence_reviews (
 id uuid PRIMARY KEY, evidence_id uuid NOT NULL REFERENCES evidence_submissions(id),
 challenge_id uuid NOT NULL UNIQUE REFERENCES evidence_challenges(id),
 actor_account text NOT NULL, claim text NOT NULL CHECK(claim IN ('INVOICE_ISSUED','SERVICE_CONFIRMED','OWNER_APPROVED','DELIVERY_DISPUTED')),
 status text NOT NULL CHECK(status IN ('VERIFIED','REJECTED','UNVERIFIABLE','PENDING_REVIEW','DISPUTED','SYNTHETIC_ONLY')),
 canonical_review text NOT NULL, canonical_payload text NOT NULL,
 attestation_nonce uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(actor_account,attestation_nonce),
 CHECK(canonical_payload::jsonb->>'verifier_account'=actor_account),
 CHECK(canonical_payload::jsonb->>'claim_type'=claim),
 CHECK(canonical_payload::jsonb->>'nonce'=attestation_nonce::text)
);
CREATE UNIQUE INDEX one_final_review ON evidence_reviews(evidence_id,actor_account,claim) WHERE status IN ('VERIFIED','REJECTED','DISPUTED','SYNTHETIC_ONLY');
CREATE TABLE evidence_events (
 id uuid PRIMARY KEY,evidence_id uuid NOT NULL REFERENCES evidence_submissions(id),
 review_id uuid REFERENCES evidence_reviews(id), actor_account text NOT NULL,
 event text NOT NULL CHECK(event IN ('SUBMITTED','CHALLENGE_CREATED','DECISION_SIGNED')),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE ON evidence_submissions FOR EACH ROW EXECUTE FUNCTION immutable_agent_record();
CREATE TRIGGER immutable_review BEFORE UPDATE OR DELETE ON evidence_reviews FOR EACH ROW EXECUTE FUNCTION immutable_agent_record();
CREATE TRIGGER immutable_evidence_event BEFORE UPDATE OR DELETE ON evidence_events FOR EACH ROW EXECUTE FUNCTION immutable_agent_record();
CREATE FUNCTION validate_evidence_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p jsonb;
BEGIN
 SELECT canonical_payload::jsonb INTO STRICT p FROM agent_proposals WHERE id=NEW.proposal_id;
 IF NEW.canonical_metadata::jsonb->>'evidenceDigest' IS DISTINCT FROM p->>'evidenceDigest' THEN RAISE EXCEPTION 'evidence binding mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_evidence_metadata BEFORE INSERT ON evidence_submissions FOR EACH ROW EXECUTE FUNCTION validate_evidence_metadata();
CREATE FUNCTION validate_evidence_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c evidence_challenges%ROWTYPE; p jsonb;
BEGIN
 SELECT * INTO STRICT c FROM evidence_challenges WHERE id=NEW.challenge_id;
 SELECT a.canonical_payload::jsonb INTO STRICT p FROM evidence_submissions e JOIN agent_proposals a ON a.id=e.proposal_id WHERE e.id=NEW.evidence_id;
 IF c.evidence_id<>NEW.evidence_id OR c.actor_account<>NEW.actor_account OR c.consumed_at IS NULL OR c.canonical_review<>NEW.canonical_review OR c.canonical_payload<>NEW.canonical_payload OR NEW.canonical_payload::jsonb->>'proposal_id' IS DISTINCT FROM p->>'proposalId' OR NEW.canonical_payload::jsonb->>'evidence_digest' IS DISTINCT FROM p->>'evidenceDigest' THEN RAISE EXCEPTION 'review binding mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_evidence_review BEFORE INSERT ON evidence_reviews FOR EACH ROW EXECUTE FUNCTION validate_evidence_review();
