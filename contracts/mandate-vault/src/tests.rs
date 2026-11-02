use super::*;
use near_sdk::{test_utils::VMContextBuilder, testing_env};
fn account(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn context(who: &str, deposit: u128) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(account("vault.testnet"))
        .signer_account_id(account(who))
        .predecessor_account_id(account(who))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(100))
        .prepaid_gas(Gas::from_tgas(300))
        .block_timestamp(100);
    testing_env!(b.build());
}
#[test]
fn checked_arithmetic_rejects_overflow() {
    assert!(std::panic::catch_unwind(|| add(u128::MAX, 1)).is_err());
    assert!(std::panic::catch_unwind(|| sub(0, 1)).is_err());
}
#[test]
fn storage_credit_is_separate() {
    context("vault.testnet", 0);
    let mut v = MandateVault::new("testnet".into());
    context("owner.testnet", NearToken::from_near(1).as_yoctonear());
    v.storage_deposit();
    let c = v.get_storage_credit(account("owner.testnet")).unwrap();
    assert!(c.locked.0 > 0);
    assert_eq!(
        add(c.available.0, c.locked.0),
        NearToken::from_near(1).as_yoctonear()
    );
    assert_eq!(v.available, 0);
}
const FIXTURE: &str = include_str!("../../../tests/fixtures/m3-policy.canonical.txt");
fn policy() -> Policy {
    near_sdk::serde_json::from_str(FIXTURE).unwrap()
}
fn id(n: u32) -> String {
    format!("{n:08x}-1111-4111-8111-111111111111")
}
fn register(v: &mut MandateVault, p: &Policy) {
    let bytes = near_sdk::serde_json::to_string(p).unwrap();
    context("owner.testnet", 1);
    v.register_mandate(
        bytes.clone(),
        hex(&env::sha256(bytes.as_bytes())),
        Some(account("guardian.testnet")),
        U128(NearToken::from_near(1).as_yoctonear()),
    );
}
fn setup() -> MandateVault {
    env::set_blockchain_interface(near_sdk::MockedBlockchain::new(
        VMContextBuilder::new().build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        vec![],
        Default::default(),
        Default::default(),
        None,
    ));
    context("vault.testnet", 0);
    let mut v = MandateVault::new("testnet".into());
    context("owner.testnet", NearToken::from_near(2).as_yoctonear());
    v.storage_deposit();
    register(&mut v, &policy());
    context("owner.testnet", 1000);
    v.fund_mandate(policy().mandate_id);
    v
}
fn proposal(v: &mut MandateVault, n: u32, amount: u128) {
    context("agent.testnet", 0);
    v.submit_proposal(
        policy().mandate_id,
        id(n),
        account("recipient.testnet"),
        U128(amount),
        "a".repeat(64),
    );
}
fn evidence(n: u32, claim: &str) -> Evidence {
    Evidence {
        protocol_version: 1,
        network_id: "testnet".into(),
        vault_account: account("vault.testnet"),
        mandate_id: policy().mandate_id,
        policy_version: 1,
        proposal_id: id(n),
        asset_id: "NativeNear".into(),
        recipient: account("recipient.testnet"),
        amount_atomic: U128(400),
        claim_type: claim.into(),
        evidence_digest: "a".repeat(64),
        verifier_account: account(if claim == "OWNER_APPROVED" {
            "owner.testnet"
        } else {
            "verifier.testnet"
        }),
        nonce: id(n * 10
            + match claim {
                "INVOICE_ISSUED" => 1,
                "SERVICE_CONFIRMED" => 2,
                _ => 3,
            }),
        issued_at_ns: near_sdk::json_types::U64(100),
        expires_at_ns: near_sdk::json_types::U64(1000),
    }
}
fn proofs(v: &mut MandateVault, n: u32) {
    for claim in ["INVOICE_ISSUED", "SERVICE_CONFIRMED", "OWNER_APPROVED"] {
        let e = evidence(n, claim);
        context(
            e.verifier_account.as_str(),
            if claim == "OWNER_APPROVED" { 1 } else { 0 },
        );
        v.attest_proposal(e);
    }
}
fn execute(v: &mut MandateVault, n: u32) {
    context("owner.testnet", 1);
    v.authorize_and_execute(policy().mandate_id, id(n));
}
fn result(success: bool) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(account("vault.testnet"))
        .predecessor_account_id(account("vault.testnet"))
        .account_balance(NearToken::from_near(100));
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        std::collections::HashMap::new(),
        vec![if success {
            near_sdk::PromiseResult::Successful(vec![])
        } else {
            near_sdk::PromiseResult::Failed
        }]
    );
}
fn rejects(f: impl FnOnce()) {
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)).is_err());
}
#[test]
fn canonical_m2_unicode_bytes_match() {
    let p = policy();
    assert_eq!(near_sdk::serde_json::to_string(&p).unwrap(), FIXTURE);
    p.validate("testnet", &account("vault.testnet"), 100);
}
#[test]
fn successful_payment_and_callback_replay() {
    let mut v = setup();
    proposal(&mut v, 1, 400);
    proofs(&mut v, 1);
    execute(&mut v, 1);
    let m = v.mandate(&policy().mandate_id);
    assert_eq!((m.available.0, m.reserved.0, m.spent.0), (600, 400, 0));
    result(true);
    assert!(v.on_settlement_result(policy().mandate_id, id(1)));
    assert!(!v.on_settlement_result(policy().mandate_id, id(1)));
    let m = v.mandate(&policy().mandate_id);
    assert_eq!((m.available.0, m.reserved.0, m.spent.0), (600, 0, 400));
    m.check();
}
#[test]
fn confirmed_failure_terminal_and_fresh_attempt() {
    let mut v = setup();
    proposal(&mut v, 1, 400);
    proofs(&mut v, 1);
    execute(&mut v, 1);
    result(false);
    assert!(!v.on_settlement_result(policy().mandate_id, id(1)));
    assert_eq!(v.available, 1000);
    rejects(|| execute(&mut v, 1));
    proposal(&mut v, 2, 400);
    proofs(&mut v, 2);
    execute(&mut v, 2);
    assert_eq!(v.reserved, 400);
}
#[test]
fn missing_callback_remains_reserved_and_cannot_be_withdrawn() {
    let mut v = setup();
    proposal(&mut v, 1, 400);
    proofs(&mut v, 1);
    execute(&mut v, 1);
    context("owner.testnet", 1);
    rejects(|| {
        v.withdraw_available(policy().mandate_id, U128(1000));
    });
    assert_eq!(v.reserved, 400);
    assert_eq!(v.mandate(&policy().mandate_id).available.0, 600);
}
#[test]
fn private_callback_cannot_be_spoofed() {
    let mut v = setup();
    proposal(&mut v, 1, 400);
    proofs(&mut v, 1);
    execute(&mut v, 1);
    context("agent.testnet", 0);
    rejects(|| {
        v.on_settlement_result(policy().mandate_id, id(1));
    });
    assert_eq!(v.reserved, 400);
}
#[test]
fn unknown_callback_result_quarantines_obligation() {
    let mut v = setup();
    proposal(&mut v, 1, 400);
    proofs(&mut v, 1);
    execute(&mut v, 1);
    context("vault.testnet", 0);
    rejects(|| {
        v.on_settlement_result(policy().mandate_id, id(1));
    });
    assert_eq!(v.reserved, 400);
}
#[test]
fn actual_funding_not_budget_is_spendable() {
    let mut v = setup();
    proposal(&mut v, 1, 400);
    proofs(&mut v, 1);
    execute(&mut v, 1);
    proposal(&mut v, 2, 400);
    proofs(&mut v, 2);
    execute(&mut v, 2);
    proposal(&mut v, 3, 400);
    proofs(&mut v, 3);
    rejects(|| execute(&mut v, 3));
    assert_eq!(v.available, 200);
    assert_eq!(v.reserved, 800);
}
#[test]
fn owner_and_agent_impersonation_rejected() {
    let mut v = setup();
    context("intruder.testnet", 1);
    rejects(|| v.pause_mandate(policy().mandate_id));
    rejects(|| v.revoke_mandate(policy().mandate_id));
    rejects(|| {
        v.withdraw_available(policy().mandate_id, U128(1));
    });
    context("intruder.testnet", 1);
    rejects(|| v.fund_mandate(policy().mandate_id));
    context("intruder.testnet", 0);
    rejects(|| {
        v.submit_proposal(
            policy().mandate_id,
            id(1),
            account("recipient.testnet"),
            U128(1),
            "a".repeat(64),
        )
    });
    assert_eq!(v.available, 1000);
}
#[test]
fn relayed_owner_authority_rejected() {
    let mut v = setup();
    let mut b = VMContextBuilder::new();
    b.current_account_id(account("vault.testnet"))
        .predecessor_account_id(account("owner.testnet"))
        .signer_account_id(account("relay.testnet"))
        .attached_deposit(NearToken::from_yoctonear(1));
    testing_env!(b.build());
    rejects(|| v.pause_mandate(policy().mandate_id));
}
#[test]
fn wrong_recipient_and_payment_cap_rejected() {
    let mut v = setup();
    context("agent.testnet", 0);
    rejects(|| {
        v.submit_proposal(
            policy().mandate_id,
            id(1),
            account("thief.testnet"),
            U128(1),
            "a".repeat(64),
        )
    });
    rejects(|| proposal(&mut v, 1, 401));
    assert_eq!(v.mandate(&policy().mandate_id).proposal_count, 0);
}
#[test]
fn per_claim_quorum_and_separate_owner_approval_required() {
    let mut v = setup();
    proposal(&mut v, 1, 400);
    rejects(|| execute(&mut v, 1));
    for claim in ["INVOICE_ISSUED", "SERVICE_CONFIRMED"] {
        context("verifier.testnet", 0);
        v.attest_proposal(evidence(1, claim));
        rejects(|| execute(&mut v, 1));
    }
    context("owner.testnet", 1);
    v.attest_proposal(evidence(1, "OWNER_APPROVED"));
    execute(&mut v, 1);
}
#[test]
fn proof_bindings_and_impersonation_rejected() {
    let mut v = setup();
    proposal(&mut v, 1, 400);
    for n in 0..10 {
        let mut e = evidence(1, "INVOICE_ISSUED");
        match n {
            0 => e.network_id = "mainnet".into(),
            1 => e.vault_account = account("other.testnet"),
            2 => e.amount_atomic = U128(399),
            3 => e.recipient = account("other.testnet"),
            4 => e.asset_id = "USDC".into(),
            5 => e.policy_version = 2,
            6 => e.evidence_digest = "b".repeat(64),
            7 => e.expires_at_ns = near_sdk::json_types::U64(100),
            8 => e.verifier_account = account("thief.testnet"),
            _ => e.claim_type = "MADE_UP".into(),
        };
        context("verifier.testnet", 0);
        rejects(|| v.attest_proposal(e));
    }
    assert!(
        v.get_proposal(policy().mandate_id, id(1))
            .unwrap()
            .attestations
            .is_empty()
    );
}
#[test]
fn nonce_and_proposal_replays_rejected() {
    let mut v = setup();
    proposal(&mut v, 1, 400);
    rejects(|| proposal(&mut v, 1, 400));
    context("verifier.testnet", 0);
    v.attest_proposal(evidence(1, "INVOICE_ISSUED"));
    rejects(|| v.attest_proposal(evidence(1, "INVOICE_ISSUED")));
    proposal(&mut v, 2, 400);
    let mut e = evidence(2, "INVOICE_ISSUED");
    e.nonce = evidence(1, "INVOICE_ISSUED").nonce;
    context("verifier.testnet", 0);
    rejects(|| v.attest_proposal(e));
}
#[test]
fn guardian_stop_only_and_revoke_terminal() {
    let mut v = setup();
    context("guardian.testnet", 1);
    v.pause_mandate(policy().mandate_id);
    rejects(|| v.resume_mandate(policy().mandate_id));
    rejects(|| v.revoke_mandate(policy().mandate_id));
    rejects(|| proposal(&mut v, 1, 400));
    context("owner.testnet", 1);
    v.resume_mandate(policy().mandate_id);
    v.revoke_mandate(policy().mandate_id);
    rejects(|| v.resume_mandate(policy().mandate_id));
    v.withdraw_available(policy().mandate_id, U128(1000));
    assert_eq!(v.withdrawal_pending, 1000);
    result(true);
    v.on_withdrawal_result(U64(0));
    assert_eq!(v.mandate(&policy().mandate_id).withdrawn.0, 1000);
}
#[test]
fn withdrawal_failure_restores_credit_once() {
    let mut v = setup();
    context("owner.testnet", 1);
    v.withdraw_available(policy().mandate_id, U128(300));
    result(false);
    v.on_withdrawal_result(U64(0));
    v.on_withdrawal_result(U64(0));
    assert_eq!(v.available, 1000);
    assert_eq!(v.withdrawal_pending, 0);
}
#[test]
fn policy_amount_and_domain_validation() {
    for n in 0..8 {
        let mut p = policy();
        match n {
            0 => p.max_per_payment_atomic = "0".into(),
            1 => p.total_budget_atomic = "340282366920938463463374607431768211456".into(),
            2 => p.max_per_payment_atomic = "01".into(),
            3 => p.network = "mainnet".into(),
            4 => p.vault_account = account("other.testnet"),
            5 => p.expires_at_ns = "99".into(),
            6 => p.verifier_policy.accounts.push(account("verifier.testnet")),
            _ => p.max_executions = 0,
        };
        rejects(|| p.validate("testnet", &account("vault.testnet"), 100));
    }
}
#[test]
fn generated_settlement_sequences_conserve_funds() {
    for mask in 0..16 {
        let mut v = setup();
        for n in 1..=4 {
            proposal(&mut v, n, 400);
            proofs(&mut v, n);
            if v.available < 400 {
                break;
            }
            execute(&mut v, n);
            result(mask & (1 << n) != 0);
            v.on_settlement_result(policy().mandate_id, id(n));
            let m = v.mandate(&policy().mandate_id);
            m.check();
            assert_eq!(v.available, m.available.0);
            assert_eq!(v.reserved, m.reserved.0);
        }
    }
}
#[test]
fn expired_proofs_and_mandates_reject_execution() {
    let mut v = setup();
    proposal(&mut v, 1, 400);
    proofs(&mut v, 1);
    let mut b = VMContextBuilder::new();
    b.current_account_id(account("vault.testnet"))
        .predecessor_account_id(account("owner.testnet"))
        .signer_account_id(account("owner.testnet"))
        .attached_deposit(NearToken::from_yoctonear(1))
        .block_timestamp(1000)
        .prepaid_gas(Gas::from_tgas(300));
    testing_env!(b.build());
    rejects(|| {
        v.authorize_and_execute(policy().mandate_id, id(1));
    });
    b.block_timestamp(policy().expiry());
    testing_env!(b.build());
    rejects(|| {
        v.authorize_and_execute(policy().mandate_id, id(1));
    });
    assert_eq!(v.reserved, 0);
}
#[test]
fn execution_slots_include_pending_and_successes() {
    let mut v = setup();
    let key = policy().mandate_id;
    let mut m = v.mandate(&key);
    m.policy.max_executions = 1;
    v.mandates.insert(&key, &m);
    proposal(&mut v, 1, 400);
    proofs(&mut v, 1);
    proposal(&mut v, 2, 400);
    proofs(&mut v, 2);
    execute(&mut v, 1);
    rejects(|| execute(&mut v, 2));
    assert_eq!(v.reserved, 400);
    result(true);
    v.on_settlement_result(key, id(1));
    rejects(|| execute(&mut v, 2));
    assert_eq!(v.reserved, 0);
}
#[test]
fn dispute_is_terminal_and_cannot_be_overridden() {
    let mut v = setup();
    proposal(&mut v, 1, 400);
    proofs(&mut v, 1);
    let mut e = evidence(1, "DELIVERY_DISPUTED");
    e.nonce = id(99);
    context("verifier.testnet", 0);
    v.attest_proposal(e);
    rejects(|| execute(&mut v, 1));
    assert_eq!(v.available, 1000);
}
#[test]
fn exhausted_agent_allowance_does_not_block_owner_withdrawal() {
    let mut v = setup();
    let key = policy().mandate_id;
    let mut m = v.mandate(&key);
    m.storage_limit = m.storage_used;
    v.mandates.insert(&key, &m);
    context("owner.testnet", 1);
    v.withdraw_available(key, U128(1000));
    result(true);
    v.on_withdrawal_result(U64(0));
    assert_eq!(v.available, 0);
}
#[test]
fn insufficient_gas_rejected_before_reservation() {
    let mut v = setup();
    proposal(&mut v, 1, 400);
    proofs(&mut v, 1);
    let mut b = VMContextBuilder::new();
    b.current_account_id(account("vault.testnet"))
        .predecessor_account_id(account("owner.testnet"))
        .signer_account_id(account("owner.testnet"))
        .attached_deposit(NearToken::from_yoctonear(1))
        .prepaid_gas(Gas::from_tgas(30));
    testing_env!(b.build());
    rejects(|| {
        v.authorize_and_execute(policy().mandate_id, id(1));
    });
    assert_eq!(v.reserved, 0);
}
#[test]
fn owner_actions_require_attached_yocto() {
    let mut v = setup();
    context("owner.testnet", 0);
    rejects(|| v.pause_mandate(policy().mandate_id));
    rejects(|| v.revoke_mandate(policy().mandate_id));
    assert_eq!(v.mandate(&policy().mandate_id).status, Status::Active);
}
#[test]
fn forged_registration_and_changed_digest_are_rejected() {
    let mut v = setup();
    let mut p = policy();
    p.mandate_id = id(44);
    let bytes = near_sdk::serde_json::to_string(&p).unwrap();
    context("intruder.testnet", 1);
    rejects(|| {
        v.register_mandate(
            bytes.clone(),
            hex(&env::sha256(bytes.as_bytes())),
            None,
            U128(1000),
        )
    });
    context("owner.testnet", 1);
    rejects(|| v.register_mandate(bytes, "0".repeat(64), None, U128(1000)));
    assert!(v.get_mandate(id(44)).is_none());
}
#[test]
fn unexpected_callback_bytes_do_not_release_reservation() {
    let mut v = setup();
    proposal(&mut v, 1, 400);
    proofs(&mut v, 1);
    execute(&mut v, 1);
    let mut b = VMContextBuilder::new();
    b.current_account_id(account("vault.testnet"))
        .predecessor_account_id(account("vault.testnet"));
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        std::collections::HashMap::new(),
        vec![near_sdk::PromiseResult::Successful(vec![1])]
    );
    rejects(|| {
        v.on_settlement_result(policy().mandate_id, id(1));
    });
    assert_eq!(v.reserved, 400);
}
#[test]
fn accounting_survives_root_state_reload() {
    let mut v = setup();
    proposal(&mut v, 1, 400);
    proofs(&mut v, 1);
    execute(&mut v, 1);
    env::state_write(&v);
    let mut restored: MandateVault = env::state_read().unwrap();
    assert_eq!(restored.reserved, 400);
    result(true);
    restored.on_settlement_result(policy().mandate_id, id(1));
    restored.mandate(&policy().mandate_id).check();
    assert_eq!(restored.mandate(&policy().mandate_id).spent.0, 400);
}
#[test]
fn multiple_verifier_quorum_counts_each_claim_separately() {
    let mut v = setup();
    let key = policy().mandate_id;
    let mut m = v.mandate(&key);
    m.policy
        .verifier_policy
        .accounts
        .push(account("verifier2.testnet"));
    m.policy.verifier_policy.threshold = 2;
    v.mandates.insert(&key, &m);
    proposal(&mut v, 1, 400);
    proofs(&mut v, 1);
    rejects(|| execute(&mut v, 1));
    for claim in ["INVOICE_ISSUED", "SERVICE_CONFIRMED"] {
        let mut e = evidence(1, claim);
        e.verifier_account = account("verifier2.testnet");
        context("verifier2.testnet", 0);
        v.attest_proposal(e);
        if claim == "INVOICE_ISSUED" {
            rejects(|| execute(&mut v, 1));
        }
    }
    execute(&mut v, 1);
    assert_eq!(v.reserved, 400);
}
#[test]
fn revoke_after_dispatch_does_not_cancel_settlement() {
    let mut v = setup();
    proposal(&mut v, 1, 400);
    proofs(&mut v, 1);
    execute(&mut v, 1);
    context("owner.testnet", 1);
    v.revoke_mandate(policy().mandate_id);
    result(true);
    v.on_settlement_result(policy().mandate_id, id(1));
    let m = v.mandate(&policy().mandate_id);
    assert_eq!(m.status, Status::Revoked);
    assert_eq!(m.spent.0, 400);
    m.check();
}
#[test]
fn verifier_identity_and_owner_claim_cannot_be_self_appointed() {
    let mut v = setup();
    proposal(&mut v, 1, 400);
    let mut e = evidence(1, "INVOICE_ISSUED");
    e.verifier_account = account("intruder.testnet");
    context("intruder.testnet", 0);
    rejects(|| v.attest_proposal(e));
    let mut e = evidence(1, "OWNER_APPROVED");
    e.verifier_account = account("verifier.testnet");
    context("verifier.testnet", 1);
    rejects(|| v.attest_proposal(e));
    assert_eq!(v.reserved, 0);
}
#[test]
fn protocol_reserve_and_owner_storage_cannot_back_spending() {
    let v = setup();
    let mut b = VMContextBuilder::new();
    b.current_account_id(account("vault.testnet"))
        .account_balance(NearToken::from_yoctonear(1000));
    testing_env!(b.build());
    rejects(|| v.liquid(400));
}
#[test]
fn initialization_reserve_includes_root_storage() {
    let mut b = VMContextBuilder::new();
    b.current_account_id(account("vault.testnet"))
        .predecessor_account_id(account("vault.testnet"))
        .signer_account_id(account("vault.testnet"))
        .storage_usage(0)
        .account_balance(NearToken::from_yoctonear(RESERVE));
    testing_env!(b.build());
    rejects(|| {
        MandateVault::new("testnet".into());
    });
}
