ALTER TABLE agent_credentials ADD COLUMN holder_account text;
ALTER TABLE agent_credentials ADD CONSTRAINT agent_credential_holder_format CHECK (
 holder_account IS NULL OR (
  purpose='demo' AND
  holder_account ~ '^(([a-z0-9]+[-_])*[a-z0-9]+\.)*([a-z0-9]+[-_])*[a-z0-9]+$' AND
  length(holder_account) BETWEEN 2 AND 64
 )
);
CREATE INDEX agent_credentials_holder ON agent_credentials(holder_account,mandate_id) WHERE holder_account IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_agent_issuer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE policy mandate_policies%ROWTYPE;
BEGIN
 SELECT * INTO STRICT policy FROM mandate_policies WHERE id=NEW.mandate_id;
 IF NEW.issuer_account IS DISTINCT FROM policy.owner_account THEN RAISE EXCEPTION 'invalid issuer'; END IF;
 IF NEW.holder_account IS NOT NULL AND NEW.holder_account IS DISTINCT FROM policy.agent_account THEN
  RAISE EXCEPTION 'invalid credential holder';
 END IF;
 RETURN NEW;
END $$;
