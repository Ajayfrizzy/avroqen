//! Native NEAR custody. M2 messages and application roles convey no authority.
pub mod policy;
use near_sdk::{
    AccountId, Gas, NearToken, PanicOnDefault, PromiseError,
    collections::LookupMap,
    env,
    json_types::{U64, U128},
    near,
};
use policy::{Policy, decimal, digest, hex, uuid};

const RESERVE: u128 = 100_000_000_000_000_000_000_000; // 0.1 NEAR, not owner funds.
const CALLBACK_GAS: Gas = Gas::from_tgas(20);
const MIN_GAS: Gas = Gas::from_tgas(60);
const MAX_PROPOSALS: u32 = 128;
fn add(a: u128, b: u128) -> u128 {
    a.checked_add(b)
        .unwrap_or_else(|| env::panic_str("OVERFLOW"))
}
fn sub(a: u128, b: u128) -> u128 {
    a.checked_sub(b)
        .unwrap_or_else(|| env::panic_str("UNDERFLOW"))
}
fn direct(who: &AccountId) {
    assert_eq!(&env::predecessor_account_id(), who, "UNAUTHORIZED");
    assert_eq!(env::signer_account_id(), *who, "DIRECT_CALL_REQUIRED");
}
fn zero() {
    assert_eq!(
        env::attached_deposit().as_yoctonear(),
        0,
        "ZERO_DEPOSIT_REQUIRED"
    );
}
fn owner(who: &AccountId) {
    direct(who);
    assert_eq!(
        env::attached_deposit().as_yoctonear(),
        1,
        "ONE_YOCTO_REQUIRED"
    );
}

#[near(serializers=[borsh,json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Status {
    Active,
    Paused,
    Revoked,
}
#[near(serializers=[borsh,json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Outcome {
    Proposed,
    Disputed,
    Pending,
    Succeeded,
    ConfirmedFailed,
}
#[near(serializers=[borsh,json])]
#[derive(Clone, Default)]
pub struct Credit {
    pub available: U128,
    pub locked: U128,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Mandate {
    pub policy: Policy,
    pub policy_digest: String,
    pub guardian: Option<AccountId>,
    pub status: Status,
    pub available: U128,
    pub reserved: U128,
    pub spent: U128,
    pub withdrawal_pending: U128,
    pub withdrawn: U128,
    pub deposited: U128,
    pub pending_count: u32,
    pub successful_count: u32,
    pub proposal_count: u32,
    pub storage_limit: U128,
    pub storage_used: U128,
}
impl Mandate {
    fn check(&self) {
        assert!(
            add(self.spent.0, self.reserved.0) <= decimal(&self.policy.total_budget_atomic),
            "BUDGET_INVARIANT"
        );
        assert_eq!(
            self.deposited.0,
            add(
                add(add(self.available.0, self.reserved.0), self.spent.0),
                add(self.withdrawal_pending.0, self.withdrawn.0)
            ),
            "CONSERVATION"
        );
        assert!(
            self.pending_count
                .checked_add(self.successful_count)
                .expect("COUNT_OVERFLOW")
                <= self.policy.max_executions,
            "EXECUTION_LIMIT"
        );
    }
    fn active(&self) {
        assert_eq!(self.status, Status::Active, "NOT_ACTIVE");
        assert!(env::block_timestamp() < self.policy.expiry(), "EXPIRED");
    }
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Attestation {
    pub signer: AccountId,
    pub claim: String,
    pub expires_at_ns: U64,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Proposal {
    pub id: String,
    pub mandate_id: String,
    pub recipient: AccountId,
    pub amount: U128,
    pub evidence_digest: String,
    pub outcome: Outcome,
    pub created_at_ns: U64,
    pub updated_at_ns: U64,
    pub attestations: Vec<Attestation>,
}
#[near(serializers=[borsh,json])]
#[derive(Clone)]
pub struct Withdrawal {
    pub id: U64,
    pub owner: AccountId,
    pub mandate_id: Option<String>,
    pub amount: U128,
    pub outcome: Outcome,
}
#[near(serializers=[json])]
#[serde(deny_unknown_fields)]
pub struct Evidence {
    pub protocol_version: u32,
    pub network_id: String,
    pub vault_account: AccountId,
    pub mandate_id: String,
    pub policy_version: u32,
    pub proposal_id: String,
    pub asset_id: String,
    pub recipient: AccountId,
    pub amount_atomic: U128,
    pub claim_type: String,
    pub evidence_digest: String,
    pub verifier_account: AccountId,
    pub nonce: String,
    pub issued_at_ns: near_sdk::json_types::U64,
    pub expires_at_ns: near_sdk::json_types::U64,
}
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MandateVault {
    network: String,
    credits: LookupMap<AccountId, Credit>,
    mandates: LookupMap<String, Mandate>,
    proposals: LookupMap<String, Proposal>,
    nonces: LookupMap<String, bool>,
    withdrawals: LookupMap<u64, Withdrawal>,
    available: u128,
    reserved: u128,
    withdrawal_pending: u128,
    storage_credit: u128,
    storage_locked: u128,
    next_withdrawal: u64,
}
#[near]
impl MandateVault {
    #[init]
    pub fn new(network: String) -> Self {
        direct(&env::current_account_id());
        assert!(
            network == "testnet" || network == "sandbox",
            "NETWORK_NOT_SUPPORTED"
        );
        let vault = Self {
            network,
            credits: LookupMap::new(b"c"),
            mandates: LookupMap::new(b"m"),
            proposals: LookupMap::new(b"p"),
            nonces: LookupMap::new(b"n"),
            withdrawals: LookupMap::new(b"w"),
            available: 0,
            reserved: 0,
            withdrawal_pending: 0,
            storage_credit: 0,
            storage_locked: 0,
            next_withdrawal: 0,
        };
        // Include the root record in measured backing; the generated init
        // wrapper writes the same fixed-size state again after this method.
        env::state_write(&vault);
        vault.liquid(0);
        vault
    }
    pub fn payments_enabled(&self) -> bool {
        true
    }
    #[payable]
    pub fn storage_deposit(&mut self) {
        let who = env::predecessor_account_id();
        direct(&who);
        let deposit = env::attached_deposit().as_yoctonear();
        assert!(deposit > 0, "EMPTY_DEPOSIT");
        let before = env::storage_usage();
        let mut credit = self.credits.get(&who).unwrap_or_default();
        credit.available.0 = add(credit.available.0, deposit);
        self.storage_credit = add(self.storage_credit, deposit);
        self.credits.insert(&who, &credit);
        self.charge(&who, before);
        self.liquid(0);
    }
    #[payable]
    pub fn register_mandate(
        &mut self,
        canonical_policy: String,
        expected_digest: String,
        guardian: Option<AccountId>,
        storage_limit: U128,
    ) {
        assert!(canonical_policy.len() <= 8192, "POLICY_TOO_LARGE");
        let policy: Policy =
            near_sdk::serde_json::from_str(&canonical_policy).expect("INVALID_POLICY");
        owner(&policy.owner_account);
        policy.validate(
            &self.network,
            &env::current_account_id(),
            env::block_timestamp(),
        );
        assert_eq!(
            near_sdk::serde_json::to_string(&policy).unwrap(),
            canonical_policy,
            "NONCANONICAL_POLICY"
        );
        digest(&expected_digest);
        assert_eq!(
            hex(&env::sha256(canonical_policy.as_bytes())),
            expected_digest,
            "DIGEST_MISMATCH"
        );
        assert!(
            !self.mandates.contains_key(&policy.mandate_id),
            "MANDATE_EXISTS"
        );
        if let Some(g) = &guardian {
            assert_ne!(g, &env::current_account_id(), "INVALID_GUARDIAN");
        }
        assert!(storage_limit.0 > 0, "STORAGE_LIMIT_REQUIRED");
        let before = env::storage_usage();
        let who = policy.owner_account.clone();
        let id = policy.mandate_id.clone();
        let m = Mandate {
            policy,
            policy_digest: expected_digest,
            guardian,
            status: Status::Active,
            available: U128(0),
            reserved: U128(0),
            spent: U128(0),
            withdrawal_pending: U128(0),
            withdrawn: U128(0),
            deposited: U128(0),
            pending_count: 0,
            successful_count: 0,
            proposal_count: 0,
            storage_limit,
            storage_used: U128(0),
        };
        self.mandates.insert(&id, &m);
        self.charge_mandate(&id, &who, before);
        self.liquid(0);
        Self::event("mandate_registered", &id, None, "Active");
    }
    #[payable]
    pub fn fund_mandate(&mut self, mandate_id: String) {
        let mut m = self.mandate(&mandate_id);
        direct(&m.policy.owner_account);
        m.active();
        let amount = env::attached_deposit().as_yoctonear();
        assert!(amount > 0, "EMPTY_DEPOSIT");
        let backing = add(
            add(add(m.available.0, m.reserved.0), m.spent.0),
            m.withdrawal_pending.0,
        );
        assert!(
            add(backing, amount) <= decimal(&m.policy.total_budget_atomic),
            "EXCESS_FUNDING"
        );
        m.available.0 = add(m.available.0, amount);
        m.deposited.0 = add(m.deposited.0, amount);
        self.available = add(self.available, amount);
        m.check();
        self.mandates.insert(&mandate_id, &m);
        self.liquid(0);
    }
    #[payable]
    pub fn pause_mandate(&mut self, mandate_id: String) {
        let mut m = self.mandate(&mandate_id);
        let caller = env::predecessor_account_id();
        assert!(
            caller == m.policy.owner_account || m.guardian.as_ref() == Some(&caller),
            "UNAUTHORIZED"
        );
        owner(&caller);
        assert_ne!(m.status, Status::Revoked, "REVOKED");
        m.status = Status::Paused;
        Self::event("mandate_paused", &mandate_id, None, "Paused");
        self.mandates.insert(&mandate_id, &m);
    }
    #[payable]
    pub fn resume_mandate(&mut self, mandate_id: String) {
        let mut m = self.mandate(&mandate_id);
        owner(&m.policy.owner_account);
        assert_eq!(m.status, Status::Paused, "NOT_PAUSED");
        assert!(env::block_timestamp() < m.policy.expiry(), "EXPIRED");
        m.status = Status::Active;
        Self::event("mandate_resumed", &mandate_id, None, "Active");
        self.mandates.insert(&mandate_id, &m);
    }
    #[payable]
    pub fn revoke_mandate(&mut self, mandate_id: String) {
        let mut m = self.mandate(&mandate_id);
        owner(&m.policy.owner_account);
        m.status = Status::Revoked;
        Self::event("mandate_revoked", &mandate_id, None, "Revoked");
        self.mandates.insert(&mandate_id, &m);
    }
    pub fn submit_proposal(
        &mut self,
        mandate_id: String,
        proposal_id: String,
        recipient: AccountId,
        amount: U128,
        evidence_digest: String,
    ) {
        zero();
        let mut m = self.mandate(&mandate_id);
        m.active();
        direct(&m.policy.agent_account);
        uuid(&proposal_id);
        digest(&evidence_digest);
        let key = Self::key(&mandate_id, &proposal_id);
        assert!(!self.proposals.contains_key(&key), "PROPOSAL_EXISTS");
        assert!(m.proposal_count < MAX_PROPOSALS, "PROPOSAL_STORAGE_LIMIT");
        assert_eq!(recipient, m.policy.recipient, "WRONG_RECIPIENT");
        assert!(
            amount.0 > 0 && amount.0 <= decimal(&m.policy.max_per_payment_atomic),
            "PAYMENT_CAP"
        );
        let before = env::storage_usage();
        m.proposal_count = m.proposal_count.checked_add(1).expect("COUNT_OVERFLOW");
        self.proposals.insert(
            &key,
            &Proposal {
                id: proposal_id,
                mandate_id: mandate_id.clone(),
                recipient,
                amount,
                evidence_digest,
                outcome: Outcome::Proposed,
                created_at_ns: U64(env::block_timestamp()),
                updated_at_ns: U64(env::block_timestamp()),
                attestations: vec![],
            },
        );
        self.mandates.insert(&mandate_id, &m);
        self.charge_mandate(&mandate_id, &m.policy.owner_account, before);
        self.liquid(0);
    }
    #[payable]
    pub fn attest_proposal(&mut self, evidence: Evidence) {
        let m = self.mandate(&evidence.mandate_id);
        m.active();
        let who = env::predecessor_account_id();
        direct(&who);
        assert_eq!(who, evidence.verifier_account, "WRONG_SIGNER");
        let own = evidence.claim_type == "OWNER_APPROVED"
            || (evidence.claim_type == "DELIVERY_DISPUTED" && who == m.policy.owner_account);
        if own {
            owner(&m.policy.owner_account);
        } else {
            zero();
            assert!(
                m.policy.verifier_policy.accounts.contains(&who),
                "UNAUTHORIZED_VERIFIER"
            );
        }
        assert!(
            evidence.claim_type == "DELIVERY_DISPUTED"
                || (evidence.claim_type == "OWNER_APPROVED"
                    && m.policy.verifier_policy.require_owner_approval)
                || m.policy
                    .verifier_policy
                    .required_claims
                    .contains(&evidence.claim_type),
            "CLAIM_NOT_ALLOWED"
        );
        assert_eq!(evidence.protocol_version, 1, "PROTOCOL_VERSION");
        assert_eq!(evidence.network_id, self.network, "WRONG_NETWORK");
        assert_eq!(
            evidence.vault_account,
            env::current_account_id(),
            "WRONG_VAULT"
        );
        assert_eq!(
            evidence.policy_version, m.policy.policy_version,
            "POLICY_VERSION"
        );
        assert_eq!(evidence.asset_id, "NativeNear", "WRONG_ASSET");
        let key = Self::key(&evidence.mandate_id, &evidence.proposal_id);
        let mut p = self.proposals.get(&key).expect("PROPOSAL_NOT_FOUND");
        assert_eq!(p.outcome, Outcome::Proposed, "PROPOSAL_TERMINAL");
        assert_eq!(p.recipient, evidence.recipient, "WRONG_RECIPIENT");
        assert_eq!(p.amount, evidence.amount_atomic, "WRONG_AMOUNT");
        assert_eq!(
            p.evidence_digest, evidence.evidence_digest,
            "WRONG_EVIDENCE"
        );
        assert!(
            evidence.issued_at_ns.0 <= env::block_timestamp()
                && evidence.expires_at_ns.0 > env::block_timestamp()
                && evidence.expires_at_ns.0 > evidence.issued_at_ns.0
                && evidence.expires_at_ns.0 <= m.policy.expiry(),
            "EXPIRED_PROOF"
        );
        uuid(&evidence.nonce);
        let nonce = format!("{who}:{}", evidence.nonce);
        assert!(!self.nonces.contains_key(&nonce), "NONCE_REPLAY");
        assert!(
            !p.attestations
                .iter()
                .any(|a| a.signer == who && a.claim == evidence.claim_type),
            "DUPLICATE_ATTESTATION"
        );
        let before = env::storage_usage();
        self.nonces.insert(&nonce, &true);
        if evidence.claim_type == "DELIVERY_DISPUTED" {
            p.outcome = Outcome::Disputed;
        }
        p.attestations.push(Attestation {
            signer: who,
            claim: evidence.claim_type,
            expires_at_ns: evidence.expires_at_ns,
        });
        assert!(p.attestations.len() <= 34, "ATTESTATION_LIMIT");
        self.proposals.insert(&key, &p);
        self.charge_mandate(&evidence.mandate_id, &m.policy.owner_account, before);
        self.liquid(0);
    }
    #[payable]
    pub fn authorize_and_execute(&mut self, mandate_id: String, proposal_id: String) {
        let mut m = self.mandate(&mandate_id);
        owner(&m.policy.owner_account);
        m.active();
        Self::gas();
        let key = Self::key(&mandate_id, &proposal_id);
        let mut p = self.proposals.get(&key).expect("PROPOSAL_NOT_FOUND");
        assert_eq!(p.outcome, Outcome::Proposed, "PROPOSAL_TERMINAL");
        assert_eq!(p.recipient, m.policy.recipient, "WRONG_RECIPIENT");
        assert!(
            p.amount.0 > 0 && p.amount.0 <= decimal(&m.policy.max_per_payment_atomic),
            "PAYMENT_CAP"
        );
        for claim in &m.policy.verifier_policy.required_claims {
            let count = p
                .attestations
                .iter()
                .filter(|a| {
                    &a.claim == claim
                        && a.expires_at_ns.0 > env::block_timestamp()
                        && m.policy.verifier_policy.accounts.contains(&a.signer)
                })
                .count();
            assert!(
                count >= m.policy.verifier_policy.threshold as usize,
                "QUORUM_REQUIRED"
            );
        }
        if m.policy.verifier_policy.require_owner_approval {
            assert!(
                p.attestations.iter().any(|a| a.claim == "OWNER_APPROVED"
                    && a.signer == m.policy.owner_account
                    && a.expires_at_ns.0 > env::block_timestamp()),
                "OWNER_APPROVAL_REQUIRED"
            );
        }
        m.available.0 = sub(m.available.0, p.amount.0);
        m.reserved.0 = add(m.reserved.0, p.amount.0);
        m.pending_count = m.pending_count.checked_add(1).expect("COUNT_OVERFLOW");
        m.check();
        self.available = sub(self.available, p.amount.0);
        self.reserved = add(self.reserved, p.amount.0);
        p.outcome = Outcome::Pending;
        p.updated_at_ns = U64(env::block_timestamp());
        self.mandates.insert(&mandate_id, &m);
        self.proposals.insert(&key, &p);
        self.liquid(p.amount.0);
        Self::event(
            "payment_dispatched",
            &mandate_id,
            Some(&proposal_id),
            "Pending",
        );
        Self::send_transfer(
            &p.recipient,
            p.amount,
            "on_settlement_result",
            near_sdk::serde_json::json!({"mandate_id":mandate_id,"proposal_id":proposal_id}),
        );
    }
    #[private]
    pub fn on_settlement_result(&mut self, mandate_id: String, proposal_id: String) -> bool {
        assert_eq!(
            env::predecessor_account_id(),
            env::current_account_id(),
            "PRIVATE_CALLBACK"
        );
        assert_eq!(env::promise_results_count(), 1, "ONE_RESULT_REQUIRED");
        let key = Self::key(&mandate_id, &proposal_id);
        let mut p = self.proposals.get(&key).expect("PROPOSAL_NOT_FOUND");
        if p.outcome != Outcome::Pending {
            return false;
        }
        let success = Self::transfer_result();
        let mut m = self.mandate(&mandate_id);
        m.reserved.0 = sub(m.reserved.0, p.amount.0);
        self.reserved = sub(self.reserved, p.amount.0);
        m.pending_count = m.pending_count.checked_sub(1).expect("COUNT_UNDERFLOW");
        if success {
            m.spent.0 = add(m.spent.0, p.amount.0);
            m.successful_count = m.successful_count.checked_add(1).expect("COUNT_OVERFLOW");
            p.outcome = Outcome::Succeeded;
        } else {
            m.available.0 = add(m.available.0, p.amount.0);
            self.available = add(self.available, p.amount.0);
            p.outcome = Outcome::ConfirmedFailed;
        }
        m.check();
        p.updated_at_ns = U64(env::block_timestamp());
        self.mandates.insert(&mandate_id, &m);
        self.proposals.insert(&key, &p);
        Self::event(
            "settlement",
            &mandate_id,
            Some(&proposal_id),
            &format!("{:?}", p.outcome),
        );
        success
    }
    #[payable]
    pub fn withdraw_available(&mut self, mandate_id: String, amount: U128) {
        let mut m = self.mandate(&mandate_id);
        owner(&m.policy.owner_account);
        Self::gas();
        assert!(amount.0 > 0, "EMPTY_WITHDRAWAL");
        let before = env::storage_usage();
        m.available.0 = sub(m.available.0, amount.0);
        m.withdrawal_pending.0 = add(m.withdrawal_pending.0, amount.0);
        self.available = sub(self.available, amount.0);
        m.check();
        self.mandates.insert(&mandate_id, &m);
        let id = self.new_withdrawal(
            m.policy.owner_account.clone(),
            Some(mandate_id.clone()),
            amount,
        );
        self.charge(&m.policy.owner_account, before);
        self.liquid(amount.0);
        self.send_withdrawal(id)
    }
    #[payable]
    pub fn withdraw_storage_credit(&mut self, amount: U128) {
        let who = env::predecessor_account_id();
        owner(&who);
        Self::gas();
        assert!(amount.0 > 0, "EMPTY_WITHDRAWAL");
        let before = env::storage_usage();
        let mut c = self.credits.get(&who).expect("NO_STORAGE_CREDIT");
        c.available.0 = sub(c.available.0, amount.0);
        self.storage_credit = sub(self.storage_credit, amount.0);
        self.credits.insert(&who, &c);
        let id = self.new_withdrawal(who.clone(), None, amount);
        self.charge(&who, before);
        self.liquid(amount.0);
        self.send_withdrawal(id)
    }
    #[private]
    pub fn on_withdrawal_result(&mut self, withdrawal_id: U64) -> bool {
        assert_eq!(
            env::predecessor_account_id(),
            env::current_account_id(),
            "PRIVATE_CALLBACK"
        );
        assert_eq!(env::promise_results_count(), 1, "ONE_RESULT_REQUIRED");
        let mut w = self
            .withdrawals
            .get(&withdrawal_id.0)
            .expect("WITHDRAWAL_NOT_FOUND");
        if w.outcome != Outcome::Pending {
            return false;
        }
        let success = Self::transfer_result();
        self.withdrawal_pending = sub(self.withdrawal_pending, w.amount.0);
        if let Some(id) = &w.mandate_id {
            let mut m = self.mandate(id);
            m.withdrawal_pending.0 = sub(m.withdrawal_pending.0, w.amount.0);
            if success {
                m.withdrawn.0 = add(m.withdrawn.0, w.amount.0);
            } else {
                m.available.0 = add(m.available.0, w.amount.0);
                self.available = add(self.available, w.amount.0);
            }
            m.check();
            self.mandates.insert(id, &m);
        } else if !success {
            let mut c = self.credits.get(&w.owner).expect("NO_STORAGE_CREDIT");
            c.available.0 = add(c.available.0, w.amount.0);
            self.storage_credit = add(self.storage_credit, w.amount.0);
            self.credits.insert(&w.owner, &c);
        }
        w.outcome = if success {
            Outcome::Succeeded
        } else {
            Outcome::ConfirmedFailed
        };
        self.withdrawals.insert(&withdrawal_id.0, &w);
        success
    }
    pub fn get_mandate(&self, mandate_id: String) -> Option<Mandate> {
        self.mandates.get(&mandate_id)
    }
    pub fn get_proposal(&self, mandate_id: String, proposal_id: String) -> Option<Proposal> {
        self.proposals.get(&Self::key(&mandate_id, &proposal_id))
    }
    pub fn get_execution(&self, mandate_id: String, proposal_id: String) -> Option<Proposal> {
        self.get_proposal(mandate_id, proposal_id)
    }
    pub fn get_withdrawal(&self, withdrawal_id: U64) -> Option<Withdrawal> {
        self.withdrawals.get(&withdrawal_id.0)
    }
    pub fn get_storage_credit(&self, account_id: AccountId) -> Option<Credit> {
        self.credits.get(&account_id)
    }
    pub fn get_accounting(&self) -> near_sdk::serde_json::Value {
        near_sdk::serde_json::json!({"network":self.network,"vault":env::current_account_id(),"available":self.available.to_string(),"payment_reserved":self.reserved.to_string(),"withdrawal_pending":self.withdrawal_pending.to_string(),"storage_credit":self.storage_credit.to_string(),"storage_locked":self.storage_locked.to_string(),"protocol_reserve_minimum":RESERVE.to_string(),"storage_usage_bytes":env::storage_usage().to_string(),"storage_byte_cost":env::storage_byte_cost().as_yoctonear().to_string(),"account_balance":env::account_balance().as_yoctonear().to_string(),"unallocated_owner_balance":"0"})
    }
}
impl MandateVault {
    fn event(action: &str, mandate: &str, proposal: Option<&str>, status: &str) {
        env::log_str(&format!(
            "EVENT_JSON:{}",
            near_sdk::serde_json::json!({"standard":"avroqen", "version":"1.0.0", "event":action, "data":[{"mandate_id":mandate,"proposal_id":proposal,"status":status}]})
        ));
    }
    fn transfer_result() -> bool {
        match env::promise_result_checked(0, 0) {
            Ok(_) => true,
            Err(PromiseError::Failed) => false,
            // A native transfer returns no bytes. Unexpected evidence quarantines
            // the existing reservation rather than releasing it as a failure.
            Err(_) => panic!("UNEXPECTED_TRANSFER_RESULT"),
        }
    }
    fn mandate(&self, id: &String) -> Mandate {
        self.mandates.get(id).expect("MANDATE_NOT_FOUND")
    }
    fn key(m: &str, p: &str) -> String {
        format!("{m}:{p}")
    }
    fn gas() {
        assert!(
            env::prepaid_gas()
                .as_gas()
                .saturating_sub(env::used_gas().as_gas())
                >= MIN_GAS.as_gas(),
            "INSUFFICIENT_GAS"
        );
    }
    fn charge(&mut self, who: &AccountId, before: u64) -> u128 {
        let bytes = env::storage_usage()
            .checked_sub(before)
            .expect("STORAGE_SHRANK");
        let cost = (bytes as u128)
            .checked_mul(env::storage_byte_cost().as_yoctonear())
            .expect("STORAGE_OVERFLOW");
        let mut c = self.credits.get(who).expect("NO_STORAGE_CREDIT");
        c.available.0 = sub(c.available.0, cost);
        c.locked.0 = add(c.locked.0, cost);
        self.storage_credit = sub(self.storage_credit, cost);
        self.storage_locked = add(self.storage_locked, cost);
        self.credits.insert(who, &c);
        cost
    }
    fn charge_mandate(&mut self, id: &String, who: &AccountId, before: u64) {
        let cost = self.charge(who, before);
        let mut m = self.mandate(id);
        m.storage_used.0 = add(m.storage_used.0, cost);
        assert!(
            m.storage_used.0 <= m.storage_limit.0,
            "MANDATE_STORAGE_LIMIT"
        );
        self.mandates.insert(id, &m);
    }
    // R/W are already dispatched obligations: they may be outside the account.
    // A + unused storage credit remain liquid liabilities. Storage stake is
    // counted exactly once; locked owner credits already back that stake.
    fn liquid(&self, outgoing: u128) {
        let storage = (env::storage_usage() as u128)
            .checked_mul(env::storage_byte_cost().as_yoctonear())
            .expect("STORAGE_OVERFLOW");
        let needed = add(
            add(
                add(self.available, self.storage_credit),
                add(storage, RESERVE),
            ),
            outgoing,
        );
        assert!(
            env::account_balance().as_yoctonear() >= needed,
            "INSUFFICIENT_LIQUID_BACKING"
        );
    }
    fn send_transfer(
        recipient: &AccountId,
        amount: U128,
        method: &str,
        args: near_sdk::serde_json::Value,
    ) {
        let transfer = env::promise_batch_create(recipient);
        env::promise_batch_action_transfer(transfer, NearToken::from_yoctonear(amount.0));
        let callback = env::promise_then(
            transfer,
            env::current_account_id(),
            method,
            near_sdk::serde_json::to_vec(&args).unwrap(),
            NearToken::from_yoctonear(0),
            CALLBACK_GAS,
        );
        env::promise_return(callback);
    }
    fn new_withdrawal(&mut self, who: AccountId, id: Option<String>, amount: U128) -> u64 {
        let n = self.next_withdrawal;
        self.next_withdrawal = n.checked_add(1).expect("ID_OVERFLOW");
        self.withdrawal_pending = add(self.withdrawal_pending, amount.0);
        self.withdrawals.insert(
            &n,
            &Withdrawal {
                id: U64(n),
                owner: who,
                mandate_id: id,
                amount,
                outcome: Outcome::Pending,
            },
        );
        n
    }
    fn send_withdrawal(&self, id: u64) {
        let w = self.withdrawals.get(&id).unwrap();
        Self::send_transfer(
            &w.owner,
            w.amount,
            "on_withdrawal_result",
            near_sdk::serde_json::json!({"withdrawal_id":id.to_string()}),
        );
    }
}
#[cfg(test)]
mod tests;
