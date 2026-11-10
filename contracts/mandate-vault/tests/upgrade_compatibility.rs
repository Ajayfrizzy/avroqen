//! Exact-artifact, local-sandbox upgrade and rollback compatibility evidence.
//! No public RPC endpoint, wallet profile, credential, or live account is used.

use mandate_vault::policy::Policy;
use near_sdk::serde_json::{Value, json};
use near_workspaces::{Account, Contract, types::NearToken};
use sha2::{Digest, Sha256};

const OLD_SHA256: &str = "b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48";
const NEW_SHA256: &str = "d2ec5048af0577b60c0aef4ecfd1aad1def4289828c841b2d7a7f83dd0f8428d";

fn artifact(path: &str, expected: &str) -> Vec<u8> {
    let bytes = std::fs::read(path).expect("approved local artifact must exist");
    assert_eq!(format!("{:x}", Sha256::digest(&bytes)), expected);
    bytes
}

fn old_artifact() -> Vec<u8> {
    artifact(
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/wasm/state-v1/mandate-vault-old-b2ce7469.wasm"
        ),
        OLD_SHA256,
    )
}

fn new_artifact() -> Vec<u8> {
    artifact(
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/wasm/state-v1/mandate-vault-candidate-d2ec5048.wasm"
        ),
        NEW_SHA256,
    )
}

fn id(n: u32) -> String {
    format!("{n:08x}-2111-4111-8111-111111111111")
}

async fn call(
    signer: &Account,
    contract: &Contract,
    method: &str,
    args: Value,
    deposit: u128,
) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    Ok(signer
        .call(contract.id(), method)
        .args_json(args)
        .deposit(NearToken::from_yoctonear(deposit))
        .max_gas()
        .transact()
        .await?)
}

async fn view(contract: &Contract, method: &str, args: Value) -> anyhow::Result<Value> {
    Ok(contract.view(method).args_json(args).await?.json()?)
}

async fn reject(
    signer: &Account,
    contract: &Contract,
    method: &str,
    args: Value,
    deposit: u128,
    error: &str,
) -> anyhow::Result<()> {
    let result = call(signer, contract, method, args, deposit).await?;
    assert!(result.is_failure(), "{method} unexpectedly succeeded");
    assert!(
        format!("{:?}", result.failures()).contains(error),
        "expected {error}, got {:?}",
        result.failures()
    );
    Ok(())
}

async fn register(
    contract: &Contract,
    owner: &Account,
    agent: &Account,
    verifier: &str,
    recipient: &str,
    number: u32,
    limits: (u128, u32),
) -> anyhow::Result<()> {
    let (budget, executions) = limits;
    let mut policy: Policy = near_sdk::serde_json::from_str(include_str!(
        "../../../tests/fixtures/m3-policy.canonical.txt"
    ))?;
    policy.mandate_id = id(number);
    policy.owner_account = owner.id().to_string().parse()?;
    policy.agent_account = agent.id().to_string().parse()?;
    policy.vault_account = contract.id().to_string().parse()?;
    policy.recipient = recipient.parse()?;
    policy.verifier_policy.accounts = vec![verifier.parse()?];
    policy.total_budget_atomic = budget.to_string();
    policy.max_per_payment_atomic = budget.to_string();
    policy.max_executions = executions;
    let canonical_policy = near_sdk::serde_json::to_string(&policy)?;
    let expected_digest = format!("{:x}", Sha256::digest(canonical_policy.as_bytes()));
    call(
        owner,
        contract,
        "register_mandate",
        json!({
            "canonical_policy": canonical_policy,
            "expected_digest": expected_digest,
            "guardian": agent.id(),
            "storage_limit": NearToken::from_near(1).as_yoctonear().to_string()
        }),
        1,
    )
    .await?
    .into_result()?;
    Ok(())
}

async fn submit(
    contract: &Contract,
    agent: &Account,
    mandate: u32,
    proposal: u32,
    recipient: &str,
    amount: u128,
) -> anyhow::Result<()> {
    call(
        agent,
        contract,
        "submit_proposal",
        json!({
            "mandate_id": id(mandate),
            "proposal_id": id(proposal),
            "recipient": recipient,
            "amount": amount.to_string(),
            "evidence_digest": "a".repeat(64)
        }),
        0,
    )
    .await?
    .into_result()?;
    Ok(())
}

async fn attest(
    contract: &Contract,
    signer: &Account,
    case: (u32, u32),
    recipient: &str,
    amount: u128,
    claim: &str,
    nonce: u32,
) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    let (mandate, proposal) = case;
    call(
        signer,
        contract,
        "attest_proposal",
        json!({"evidence": {
            "protocol_version": 1,
            "network_id": "testnet",
            "vault_account": contract.id(),
            "mandate_id": id(mandate),
            "policy_version": 1,
            "proposal_id": id(proposal),
            "asset_id": "NativeNear",
            "recipient": recipient,
            "amount_atomic": amount.to_string(),
            "claim_type": claim,
            "evidence_digest": "a".repeat(64),
            "verifier_account": signer.id(),
            "nonce": id(nonce),
            "issued_at_ns": "1",
            "expires_at_ns": "2000000000000000000"
        }}),
        if claim == "OWNER_APPROVED" || claim == "DELIVERY_DISPUTED" {
            1
        } else {
            0
        },
    )
    .await
}

async fn ready(
    contract: &Contract,
    owner: &Account,
    verifier: &Account,
    mandate: u32,
    proposal: u32,
    recipient: &str,
    amount: u128,
) -> anyhow::Result<()> {
    for (offset, claim) in ["INVOICE_ISSUED", "SERVICE_CONFIRMED"].iter().enumerate() {
        attest(
            contract,
            verifier,
            (mandate, proposal),
            recipient,
            amount,
            claim,
            proposal * 10 + offset as u32,
        )
        .await?
        .into_result()?;
    }
    attest(
        contract,
        owner,
        (mandate, proposal),
        recipient,
        amount,
        "OWNER_APPROVED",
        proposal * 10 + 2,
    )
    .await?
    .into_result()?;
    Ok(())
}

async fn stable_snapshot(
    contract: &Contract,
    owner: &Account,
    mandates: &[u32],
    proposals: &[(u32, u32)],
) -> anyhow::Result<Value> {
    let accounting = view(contract, "get_accounting", json!({})).await?;
    let mut normalized = accounting.clone();
    let object = normalized.as_object_mut().expect("accounting object");
    object.remove("account_balance");
    object.remove("storage_usage_bytes");
    let mut mandate_views = vec![];
    for mandate in mandates {
        mandate_views
            .push(view(contract, "get_mandate", json!({"mandate_id": id(*mandate)})).await?);
    }
    let mut proposal_views = vec![];
    for (mandate, proposal) in proposals {
        proposal_views.push(
            view(
                contract,
                "get_proposal",
                json!({"mandate_id": id(*mandate), "proposal_id": id(*proposal)}),
            )
            .await?,
        );
    }
    Ok(json!({
        "accounting": normalized,
        "credit": view(contract, "get_storage_credit", json!({"account_id": owner.id()})).await?,
        "withdrawal": view(contract, "get_withdrawal", json!({"withdrawal_id": "0"})).await?,
        "mandates": mandate_views,
        "proposals": proposal_views
    }))
}

fn assert_conserved(mandate: &Value) {
    let number = |key: &str| mandate[key].as_str().unwrap().parse::<u128>().unwrap();
    assert_eq!(
        number("deposited"),
        number("available")
            + number("reserved")
            + number("spent")
            + number("withdrawal_pending")
            + number("withdrawn")
    );
}

#[tokio::test]
async fn exact_old_new_rollback_preserves_populated_state_and_guards() -> anyhow::Result<()> {
    let old = old_artifact();
    let new = new_artifact();
    assert_eq!(old.len(), 366_735);
    assert_eq!(new.len(), 367_353);

    let worker = near_workspaces::sandbox().await?;
    let contract = worker.dev_deploy(&old).await?;
    contract
        .call("new")
        .args_json(json!({"network": "testnet"}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let owner = worker.dev_create_account().await?;
    let agent = worker.dev_create_account().await?;
    let verifier = worker.dev_create_account().await?;
    let recipient = worker.dev_create_account().await?;
    call(
        &owner,
        &contract,
        "storage_deposit",
        json!({}),
        NearToken::from_near(8).as_yoctonear(),
    )
    .await?
    .into_result()?;

    let unit = NearToken::from_millinear(1).as_yoctonear();
    // A transfer to a nonexistent account deterministically reaches the old
    // contract's callback and leaves a terminal ConfirmedFailed proposal.
    let missing_recipient = format!("missing.{}", recipient.id());
    register(
        &contract,
        &owner,
        &agent,
        verifier.id().as_str(),
        &missing_recipient,
        101,
        (unit, 1),
    )
    .await?;
    call(
        &owner,
        &contract,
        "fund_mandate",
        json!({"mandate_id": id(101)}),
        unit,
    )
    .await?
    .into_result()?;
    submit(&contract, &agent, 101, 1011, &missing_recipient, unit).await?;
    ready(
        &contract,
        &owner,
        &verifier,
        101,
        1011,
        &missing_recipient,
        unit,
    )
    .await?;
    let failed = call(
        &owner,
        &contract,
        "authorize_and_execute",
        json!({"mandate_id": id(101), "proposal_id": id(1011)}),
        1,
    )
    .await?;
    assert!(!failed.receipt_failures().is_empty());
    assert!(!failed.json::<bool>()?);

    register(
        &contract,
        &owner,
        &agent,
        verifier.id().as_str(),
        recipient.id().as_str(),
        100,
        (unit * 8, 4),
    )
    .await?;
    call(
        &owner,
        &contract,
        "fund_mandate",
        json!({"mandate_id": id(100)}),
        unit * 5,
    )
    .await?
    .into_result()?;

    // A successful settlement, a terminal dispute, and a completed withdrawal
    // populate independent nested records before code replacement.
    submit(&contract, &agent, 100, 1001, recipient.id().as_str(), unit).await?;
    ready(
        &contract,
        &owner,
        &verifier,
        100,
        1001,
        recipient.id().as_str(),
        unit,
    )
    .await?;
    call(
        &owner,
        &contract,
        "authorize_and_execute",
        json!({"mandate_id": id(100), "proposal_id": id(1001)}),
        1,
    )
    .await?
    .into_result()?;
    submit(&contract, &agent, 100, 1002, recipient.id().as_str(), unit).await?;
    attest(
        &contract,
        &owner,
        (100, 1002),
        recipient.id().as_str(),
        unit,
        "DELIVERY_DISPUTED",
        10_029,
    )
    .await?
    .into_result()?;
    call(
        &owner,
        &contract,
        "withdraw_available",
        json!({"mandate_id": id(100), "amount": unit.to_string()}),
        1,
    )
    .await?
    .into_result()?;

    // The exact old artifact accepts each legacy overlap. It also accepts a
    // proposal under each unsafe policy, creating historical state that the
    // candidate must read but never extend into new authorization.
    let overlaps = [
        (200, owner.id().as_str(), "VERIFIER_IS_OWNER"),
        (201, agent.id().as_str(), "VERIFIER_IS_AGENT"),
        (202, recipient.id().as_str(), "VERIFIER_IS_RECIPIENT"),
        (203, contract.id().as_str(), "VERIFIER_IS_VAULT"),
    ];
    for (mandate, overlapping, _) in overlaps {
        register(
            &contract,
            &owner,
            &agent,
            overlapping,
            recipient.id().as_str(),
            mandate,
            (unit * 2, 2),
        )
        .await?;
        call(
            &owner,
            &contract,
            "fund_mandate",
            json!({"mandate_id": id(mandate)}),
            unit,
        )
        .await?
        .into_result()?;
        submit(
            &contract,
            &agent,
            mandate,
            mandate * 10 + 1,
            recipient.id().as_str(),
            unit,
        )
        .await?;
    }

    let mandates = [100, 101, 200, 201, 202, 203];
    let proposals = [
        (100, 1001),
        (100, 1002),
        (101, 1011),
        (200, 2001),
        (201, 2011),
        (202, 2021),
        (203, 2031),
    ];
    for mandate in mandates {
        assert_conserved(
            &view(&contract, "get_mandate", json!({"mandate_id": id(mandate)})).await?,
        );
    }

    let before_upgrade = stable_snapshot(&contract, &owner, &mandates, &proposals).await?;
    let account_before = contract.view_account().await?;
    let upgrade = contract
        .as_account()
        .batch(contract.id())
        .deploy(&new)
        .transact()
        .await?
        .into_result()?;
    worker.fast_forward(5).await?;
    assert_eq!(worker.view_code(contract.id()).await?, new);
    let account_after = contract.view_account().await?;
    assert_eq!(
        account_after.storage_usage - account_before.storage_usage,
        (367_353 - 366_735) as u64
    );
    let upgrade_burned: u128 = upgrade
        .outcomes()
        .iter()
        .map(|outcome| outcome.tokens_burnt.as_yoctonear())
        .sum();
    assert_eq!(
        account_before.balance.as_yoctonear() - account_after.balance.as_yoctonear(),
        upgrade_burned
    );
    assert_eq!(
        stable_snapshot(&contract, &owner, &mandates, &proposals).await?,
        before_upgrade,
        "code-only replacement changed contract state"
    );

    for (mandate, _, error) in overlaps {
        let new_proposal = mandate * 10 + 2;
        reject(
            &agent,
            &contract,
            "submit_proposal",
            json!({
                "mandate_id": id(mandate),
                "proposal_id": id(new_proposal),
                "recipient": recipient.id(),
                "amount": unit.to_string(),
                "evidence_digest": "b".repeat(64)
            }),
            0,
            error,
        )
        .await?;
        assert!(
            view(
                &contract,
                "get_proposal",
                json!({"mandate_id": id(mandate), "proposal_id": id(new_proposal)})
            )
            .await?
            .is_null()
        );
        reject(
            &owner,
            &contract,
            "attest_proposal",
            json!({"evidence": {
                "protocol_version": 1,
                "network_id": "testnet",
                "vault_account": contract.id(),
                "mandate_id": id(mandate),
                "policy_version": 1,
                "proposal_id": id(mandate * 10 + 1),
                "asset_id": "NativeNear",
                "recipient": recipient.id(),
                "amount_atomic": unit.to_string(),
                "claim_type": "OWNER_APPROVED",
                "evidence_digest": "a".repeat(64),
                "verifier_account": owner.id(),
                "nonce": id(mandate * 10 + 9),
                "issued_at_ns": "1",
                "expires_at_ns": "2000000000000000000"
            }}),
            1,
            error,
        )
        .await?;
        reject(
            &owner,
            &contract,
            "authorize_and_execute",
            json!({"mandate_id": id(mandate), "proposal_id": id(mandate * 10 + 1)}),
            1,
            error,
        )
        .await?;
    }

    // Recovery remains available without turning an unsafe mandate into new
    // payment authority.
    call(
        &agent,
        &contract,
        "pause_mandate",
        json!({"mandate_id": id(200)}),
        1,
    )
    .await?
    .into_result()?;
    call(
        &owner,
        &contract,
        "revoke_mandate",
        json!({"mandate_id": id(201)}),
        1,
    )
    .await?
    .into_result()?;
    call(
        &owner,
        &contract,
        "withdraw_available",
        json!({"mandate_id": id(201), "amount": unit.to_string()}),
        1,
    )
    .await?
    .into_result()?;

    // A valid policy retains its normal authorized path after replacement.
    submit(&contract, &agent, 100, 1003, recipient.id().as_str(), unit).await?;
    ready(
        &contract,
        &owner,
        &verifier,
        100,
        1003,
        recipient.id().as_str(),
        unit,
    )
    .await?;
    let recipient_before = recipient.view_account().await?.balance.as_yoctonear();
    call(
        &owner,
        &contract,
        "authorize_and_execute",
        json!({"mandate_id": id(100), "proposal_id": id(1003)}),
        1,
    )
    .await?
    .into_result()?;
    assert_eq!(
        recipient.view_account().await?.balance.as_yoctonear() - recipient_before,
        unit
    );

    let rollback_mandates = [100, 101, 200, 201, 202, 203];
    let rollback_proposals = [
        (100, 1001),
        (100, 1002),
        (100, 1003),
        (101, 1011),
        (200, 2001),
        (201, 2011),
        (202, 2021),
        (203, 2031),
    ];
    for mandate in rollback_mandates {
        assert_conserved(
            &view(&contract, "get_mandate", json!({"mandate_id": id(mandate)})).await?,
        );
    }
    let before_rollback =
        stable_snapshot(&contract, &owner, &rollback_mandates, &rollback_proposals).await?;
    let rollback_account_before = contract.view_account().await?;
    let rollback = contract
        .as_account()
        .batch(contract.id())
        .deploy(&old)
        .transact()
        .await?
        .into_result()?;
    worker.fast_forward(5).await?;
    assert_eq!(worker.view_code(contract.id()).await?, old);
    let rollback_account_after = contract.view_account().await?;
    assert_eq!(
        rollback_account_before.storage_usage - rollback_account_after.storage_usage,
        (367_353 - 366_735) as u64
    );
    let rollback_burned: u128 = rollback
        .outcomes()
        .iter()
        .map(|outcome| outcome.tokens_burnt.as_yoctonear())
        .sum();
    assert_eq!(
        rollback_account_before.balance.as_yoctonear()
            - rollback_account_after.balance.as_yoctonear(),
        rollback_burned
    );
    assert_eq!(
        stable_snapshot(&contract, &owner, &rollback_mandates, &rollback_proposals).await?,
        before_rollback,
        "rollback code replacement changed contract state"
    );

    // Security consequence, demonstrated only after the mutation-free rollback
    // comparison: the old code again accepts a proposal under an unsafe policy.
    submit(&contract, &agent, 202, 2022, recipient.id().as_str(), unit).await?;
    assert!(
        !view(
            &contract,
            "get_proposal",
            json!({"mandate_id": id(202), "proposal_id": id(2022)})
        )
        .await?
        .is_null()
    );

    println!(
        "UPGRADE_COMPATIBILITY {}",
        json!({
            "scope": "isolated local sandbox only",
            "oldSha256": OLD_SHA256,
            "newSha256": NEW_SHA256,
            "upgradeGasBurnt": upgrade.total_gas_burnt.as_gas().to_string(),
            "upgradeTokensBurnt": upgrade_burned.to_string(),
            "upgradeBalanceBefore": account_before.balance.as_yoctonear().to_string(),
            "upgradeBalanceAfter": account_after.balance.as_yoctonear().to_string(),
            "upgradeStorageBefore": account_before.storage_usage.to_string(),
            "upgradeStorageAfter": account_after.storage_usage.to_string(),
            "rollbackGasBurnt": rollback.total_gas_burnt.as_gas().to_string(),
            "rollbackTokensBurnt": rollback_burned.to_string(),
            "rollbackBalanceBefore": rollback_account_before.balance.as_yoctonear().to_string(),
            "rollbackBalanceAfter": rollback_account_after.balance.as_yoctonear().to_string(),
            "rollbackStorageBefore": rollback_account_before.storage_usage.to_string(),
            "rollbackStorageAfter": rollback_account_after.storage_usage.to_string(),
            "statePreservedAcrossUpgrade": true,
            "statePreservedAcrossRollback": true,
            "inFlightCallbackSnapshot": "not supported by deterministic near-workspaces receipt completion"
        })
    );
    Ok(())
}
