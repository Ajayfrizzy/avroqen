CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  network text NOT NULL CHECK (network IN ('testnet', 'mainnet')),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, network)
);

CREATE TABLE memberships (
  org_id uuid NOT NULL,
  network text NOT NULL,
  account_id text NOT NULL CHECK (length(account_id) BETWEEN 2 AND 64 AND account_id ~ '^(([a-z0-9]+[-_])*[a-z0-9]+\.)*([a-z0-9]+[-_])*[a-z0-9]+$'),
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (org_id, network, account_id),
  FOREIGN KEY (org_id, network) REFERENCES organizations(id, network)
);
CREATE INDEX memberships_identity ON memberships(network, account_id) WHERE status = 'active';

CREATE TABLE registered_agents (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  network text NOT NULL,
  near_account text NOT NULL CHECK (length(near_account) BETWEEN 2 AND 64 AND near_account ~ '^(([a-z0-9]+[-_])*[a-z0-9]+\.)*([a-z0-9]+[-_])*[a-z0-9]+$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  disabled_at timestamptz,
  FOREIGN KEY (org_id, network) REFERENCES organizations(id, network),
  UNIQUE (org_id, network, near_account)
);

CREATE TABLE auth_challenges (
  id uuid PRIMARY KEY,
  network text NOT NULL CHECK (network IN ('testnet', 'mainnet')),
  account_id text NOT NULL CHECK (length(account_id) BETWEEN 2 AND 64),
  nonce bytea NOT NULL UNIQUE CHECK (octet_length(nonce) = 32),
  browser_hash text NOT NULL CHECK (browser_hash ~ '^[0-9a-f]{64}$'),
  message text NOT NULL,
  recipient text NOT NULL,
  callback_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at),
  UNIQUE (id, network, account_id)
);
CREATE INDEX auth_challenges_expiry ON auth_challenges(expires_at);

CREATE TABLE auth_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  challenge_id uuid NOT NULL UNIQUE,
  csrf_hash text NOT NULL CHECK (csrf_hash ~ '^[0-9a-f]{64}$'),
  network text NOT NULL CHECK (network IN ('testnet', 'mainnet')),
  account_id text NOT NULL CHECK (length(account_id) BETWEEN 2 AND 64),
  public_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at),
  FOREIGN KEY (challenge_id, network, account_id) REFERENCES auth_challenges(id, network, account_id)
);
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires_at);

CREATE TABLE security_audit_records (
  id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  event text NOT NULL CHECK (event IN ('challenge_created', 'login_succeeded', 'login_denied', 'logout', 'organization_created', 'agent_registered', 'agent_disabled', 'access_denied', 'rate_limited')),
  actor_account text,
  network text CHECK (network IN ('testnet', 'mainnet')),
  org_id uuid REFERENCES organizations(id),
  target_id uuid,
  reason text NOT NULL CHECK (reason ~ '^[A-Z_]{1,64}$')
);

CREATE TABLE request_limits (
  bucket_hash text NOT NULL CHECK (bucket_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits > 0),
  PRIMARY KEY (bucket_hash, window_start)
);
