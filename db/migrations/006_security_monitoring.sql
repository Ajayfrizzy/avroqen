CREATE TRIGGER security_audit_append_only BEFORE UPDATE OR DELETE ON security_audit_records FOR EACH ROW EXECUTE FUNCTION immutable_agent_record();
CREATE TABLE security_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 source text NOT NULL CHECK(source IN ('audit','agent','mandate','evidence','chain','observation')),
 source_id text NOT NULL CHECK(length(source_id)<=200), org_id uuid REFERENCES organizations(id),
 mandate_id uuid REFERENCES mandate_policies(id), subject text NOT NULL CHECK(length(subject)<=128),
 event_type text NOT NULL CHECK(event_type ~ '^[A-Za-z_]{1,64}$'),
 reason text NOT NULL CHECK(reason ~ '^[A-Z_]{1,64}$'),
 occurred_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(source,source_id), CHECK(mandate_id IS NULL OR org_id IS NOT NULL)
);
CREATE INDEX security_events_window ON security_events(org_id,subject,occurred_at);
CREATE TRIGGER security_events_immutable BEFORE UPDATE OR DELETE ON security_events FOR EACH ROW EXECUTE FUNCTION immutable_agent_record();
CREATE TABLE security_alerts (
 id uuid PRIMARY KEY, dedupe_key text NOT NULL UNIQUE, rule text NOT NULL,
 severity text NOT NULL CHECK(severity IN ('HIGH','MEDIUM','LOW')),
 classification text NOT NULL, explanation text NOT NULL,
 org_id uuid REFERENCES organizations(id), mandate_id uuid REFERENCES mandate_policies(id),
 subject text NOT NULL, window_start timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'OPEN' CHECK(state IN ('OPEN','ACKNOWLEDGED','INVESTIGATING','RESOLVED','DISMISSED')),
 first_observed timestamptz NOT NULL,last_observed timestamptz NOT NULL,
 occurrences integer NOT NULL CHECK(occurrences>0), version integer NOT NULL DEFAULT 1,
 assigned_account text, resolution_reason text,
 UNIQUE(id,org_id)
);
CREATE TABLE security_alert_evidence (
 alert_id uuid NOT NULL REFERENCES security_alerts(id), event_id bigint NOT NULL REFERENCES security_events(id),
 PRIMARY KEY(alert_id,event_id)
);
CREATE TABLE security_incident_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, alert_id uuid NOT NULL REFERENCES security_alerts(id),
 action text NOT NULL CHECK(action IN ('DETECTED','OBSERVED','ACKNOWLEDGED','INVESTIGATING','RESOLVED','DISMISSED')),
 actor_account text, reason text, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 version integer NOT NULL
);
CREATE TABLE security_worker_health (
 worker text PRIMARY KEY CHECK(worker IN ('reconciliation','monitoring')),
 last_success timestamptz NOT NULL
);
CREATE TABLE security_observations (
 id text PRIMARY KEY CHECK(length(id)<=200), org_id uuid REFERENCES organizations(id), mandate_id uuid REFERENCES mandate_policies(id),
 subject text NOT NULL CHECK(length(subject)<=128), event_type text NOT NULL CHECK(event_type ~ '^[A-Za-z_]{1,64}$'),
 reason text NOT NULL CHECK(reason ~ '^[A-Z_]{1,64}$'), occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER security_observations_immutable BEFORE UPDATE OR DELETE ON security_observations FOR EACH ROW EXECUTE FUNCTION immutable_agent_record();
CREATE TRIGGER security_alert_evidence_immutable BEFORE UPDATE OR DELETE ON security_alert_evidence FOR EACH ROW EXECUTE FUNCTION immutable_agent_record();
CREATE TRIGGER security_history_immutable BEFORE UPDATE OR DELETE ON security_incident_history FOR EACH ROW EXECUTE FUNCTION immutable_agent_record();
CREATE FUNCTION protect_security_alert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'retained incident'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','first_observed','last_observed','occurrences','version','assigned_account','resolution_reason']) IS DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['state','first_observed','last_observed','occurrences','version','assigned_account','resolution_reason'])
 OR NEW.version<>OLD.version+1 OR NEW.occurrences<OLD.occurrences
 OR NEW.first_observed>OLD.first_observed OR NEW.last_observed<OLD.last_observed
 THEN RAISE EXCEPTION 'immutable alert binding'; END IF;
 IF NEW.state<>OLD.state AND NOT (
 (OLD.state='OPEN' AND NEW.state='ACKNOWLEDGED') OR
 (OLD.state='ACKNOWLEDGED' AND NEW.state='INVESTIGATING') OR
 (OLD.state='INVESTIGATING' AND NEW.state IN ('RESOLVED','DISMISSED'))
 ) THEN RAISE EXCEPTION 'invalid incident transition'; END IF;
 IF NEW.state IN ('RESOLVED','DISMISSED') AND NEW.resolution_reason IS NULL THEN RAISE EXCEPTION 'resolution required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_security_alert BEFORE UPDATE OR DELETE ON security_alerts FOR EACH ROW EXECUTE FUNCTION protect_security_alert();
CREATE FUNCTION security_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.mandate_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM mandate_policies WHERE id=NEW.mandate_id AND org_id=NEW.org_id) THEN RAISE EXCEPTION 'monitor scope mismatch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER security_event_scope BEFORE INSERT ON security_events FOR EACH ROW EXECUTE FUNCTION security_scope_guard();
CREATE TRIGGER security_alert_scope BEFORE INSERT ON security_alerts FOR EACH ROW EXECUTE FUNCTION security_scope_guard();
CREATE TRIGGER security_observation_scope BEFORE INSERT ON security_observations FOR EACH ROW EXECUTE FUNCTION security_scope_guard();
CREATE TABLE security_rule_hits (
 event_id bigint NOT NULL REFERENCES security_events(id), rule text NOT NULL, dedupe_key text NOT NULL,
 PRIMARY KEY(event_id,rule)
);
CREATE INDEX security_rule_group ON security_rule_hits(dedupe_key);
CREATE TRIGGER security_rule_hits_immutable BEFORE UPDATE OR DELETE ON security_rule_hits FOR EACH ROW EXECUTE FUNCTION immutable_agent_record();
