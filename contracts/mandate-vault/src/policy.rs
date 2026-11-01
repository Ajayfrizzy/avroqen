use near_sdk::{AccountId, near};

#[near(serializers = [borsh, json])]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[derive(Clone, Debug)]
pub struct VerifierPolicy {
    pub version: u32,
    pub accounts: Vec<AccountId>,
    pub threshold: u32,
    pub required_claims: Vec<String>,
    pub require_owner_approval: bool,
}
#[near(serializers = [borsh, json])]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[derive(Clone, Debug)]
pub struct Policy {
    pub schema_version: u32,
    pub policy_version: u32,
    pub mandate_id: String,
    pub organization_id: String,
    pub owner_account: AccountId,
    pub network: String,
    pub agent_account: AccountId,
    pub vault_account: AccountId,
    pub agent_id: String,
    pub recipient: AccountId,
    pub asset: String,
    pub task_reference: String,
    pub max_per_payment_atomic: String,
    pub total_budget_atomic: String,
    pub expires_at_ns: String,
    pub max_executions: u32,
    pub verifier_policy: VerifierPolicy,
}
pub fn decimal(v: &str) -> u128 {
    assert!(
        !v.is_empty() && v.len() <= 39 && v.bytes().all(|b| b.is_ascii_digit()),
        "INVALID_AMOUNT"
    );
    assert!(v == "0" || !v.starts_with('0'), "NONCANONICAL_AMOUNT");
    v.parse().expect("AMOUNT_OVERFLOW")
}
pub fn uuid(v: &str) {
    assert!(
        v.len() == 36
            && v.bytes()
                .enumerate()
                .all(|(i, b)| if [8, 13, 18, 23].contains(&i) {
                    b == b'-'
                } else {
                    b.is_ascii_digit() || (b'a'..=b'f').contains(&b)
                }),
        "INVALID_ID"
    );
}
pub fn digest(v: &str) {
    assert!(
        v.len() == 64
            && v.bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
        "INVALID_DIGEST"
    );
}
pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
impl Policy {
    pub fn validate(&self, network: &str, vault: &AccountId, now: u64) {
        assert_eq!(self.schema_version, 1, "SCHEMA_VERSION");
        assert_eq!(self.policy_version, 1, "POLICY_VERSION");
        uuid(&self.mandate_id);
        uuid(&self.organization_id);
        uuid(&self.agent_id);
        assert_eq!(self.network, network, "WRONG_NETWORK");
        assert_eq!(&self.vault_account, vault, "WRONG_VAULT");
        assert_eq!(self.asset, "NativeNear", "WRONG_ASSET");
        assert!(
            self.recipient != *vault
                && self.owner_account != *vault
                && self.agent_account != *vault,
            "VAULT_ROLE_FORBIDDEN"
        );
        let cap = decimal(&self.max_per_payment_atomic);
        assert!(
            cap > 0 && cap <= decimal(&self.total_budget_atomic),
            "INVALID_BUDGET"
        );
        assert!(self.max_executions > 0, "INVALID_EXECUTION_LIMIT");
        assert!(self.expiry() > now, "EXPIRED");
        assert!(
            !self.task_reference.is_empty()
                && self.task_reference.encode_utf16().count() <= 160
                && self.task_reference.chars().all(|c| !c.is_ascii_control()),
            "INVALID_TASK"
        );
        let v = &self.verifier_policy;
        assert!(
            v.version == 1
                && !v.accounts.is_empty()
                && v.accounts.len() <= 16
                && v.threshold > 0
                && v.threshold as usize <= v.accounts.len(),
            "INVALID_VERIFIERS"
        );
        assert!(
            v.accounts.windows(2).all(|w| w[0] < w[1]),
            "UNSORTED_VERIFIERS"
        );
        assert!(
            !v.required_claims.is_empty()
                && v.required_claims.len() <= 2
                && v.required_claims.windows(2).all(|w| w[0] < w[1])
                && v.required_claims
                    .iter()
                    .all(|c| c == "INVOICE_ISSUED" || c == "SERVICE_CONFIRMED"),
            "INVALID_CLAIMS"
        );
    }
    pub fn expiry(&self) -> u64 {
        u64::try_from(decimal(&self.expires_at_ns)).expect("TIME_OVERFLOW")
    }
}
