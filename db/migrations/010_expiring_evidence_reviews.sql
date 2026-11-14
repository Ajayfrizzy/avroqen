CREATE FUNCTION enforce_active_final_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status IN ('VERIFIED','REJECTED','DISPUTED','SYNTHETIC_ONLY') THEN
  -- Serialize direct inserts as well as API writes on the immutable evidence row.
  PERFORM 1 FROM evidence_submissions WHERE id=NEW.evidence_id FOR UPDATE;
  IF EXISTS (
   SELECT 1 FROM evidence_reviews r
   WHERE r.evidence_id=NEW.evidence_id
     AND r.actor_account=NEW.actor_account
     AND r.claim=NEW.claim
     AND r.status IN ('VERIFIED','REJECTED','DISPUTED','SYNTHETIC_ONLY')
     AND (
      r.status='DISPUTED'
      OR r.canonical_payload::jsonb->>'expires_at_ns' !~ '^[0-9]+$'
      OR (r.canonical_payload::jsonb->>'expires_at_ns')::numeric >
         trunc(extract(epoch FROM clock_timestamp())*1000000000)
     )
  ) THEN
   RAISE EXCEPTION 'active final review exists' USING ERRCODE='23505';
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE TRIGGER active_final_review BEFORE INSERT ON evidence_reviews
 FOR EACH ROW EXECUTE FUNCTION enforce_active_final_review();

DROP INDEX one_final_review;
