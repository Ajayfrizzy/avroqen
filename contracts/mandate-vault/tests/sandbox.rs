//! Real local NEAR Wasm execution. No public network endpoints or wallet keys.
use mandate_vault::policy::Policy;
use near_sdk::serde_json::{Value, json};
use near_workspaces::{Account, Contract, types::NearToken};
use sha2::{Digest, Sha256};
fn id(n: u32) -> String {
    format!("{n:08x}-1111-4111-8111-111111111111")
}
async fn call(
    a: &Account,
    c: &Contract,
    method: &str,
    args: Value,
    deposit: u128,
) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    Ok(a.call(c.id(), method)
        .args_json(args)
        .deposit(NearToken::from_yoctonear(deposit))
        .max_gas()
        .transact()
        .await?)
}
async fn view(c: &Contract, method: &str, args: Value) -> anyhow::Result<Value> {
    Ok(c.view(method).args_json(args).await?.json()?)
}
async fn reject(
    a: &Account,
    c: &Contract,
    method: &str,
    args: Value,
    deposit: u128,
    code: &str,
) -> anyhow::Result<()> {
    let r = call(a, c, method, args, deposit).await?;
    assert!(r.is_failure(), "{method} unexpectedly succeeded");
    assert!(
        format!("{:?}", r.failures()).contains(code),
        "expected {code}: {:?}",
        r.failures()
    );
    Ok(())
}
async fn register(
    c: &Contract,
    roles: (&Account, &Account, &Account),
    recipient: &str,
    n: u32,
    budget: u128,
    count: u32,
) -> anyhow::Result<()> {
    let (owner, agent, verifier) = roles;
    let mut p: Policy = near_sdk::serde_json::from_str(include_str!(
        "../../../tests/fixtures/m3-policy.canonical.txt"
    ))?;
    p.mandate_id = id(n);
    p.owner_account = owner.id().to_string().parse()?;
    p.agent_account = agent.id().to_string().parse()?;
    p.vault_account = c.id().to_string().parse()?;
    p.recipient = recipient.parse()?;
    p.verifier_policy.accounts = vec![verifier.id().to_string().parse()?];
    p.total_budget_atomic = budget.to_string();
    p.max_per_payment_atomic = budget.to_string();
    p.max_executions = count;
    let bytes = near_sdk::serde_json::to_string(&p)?;
    let digest = format!("{:x}", Sha256::digest(bytes.as_bytes()));
    call(owner,c,"register_mandate",json!({"canonical_policy":bytes,"expected_digest":digest,"guardian":agent.id(),"storage_limit":NearToken::from_near(1).as_yoctonear().to_string()}),1).await?.into_result()?;
    Ok(())
}
async fn prepare(
    c: &Contract,
    roles: (&Account, &Account, &Account),
    recipient: &str,
    m: u32,
    n: u32,
    amount: u128,
) -> anyhow::Result<()> {
    let (owner, agent, verifier) = roles;
    call(agent,c,"submit_proposal",json!({"mandate_id":id(m),"proposal_id":id(n),"recipient":recipient,"amount":amount.to_string(),"evidence_digest":"a".repeat(64)}),0).await?.into_result()?;
    for (i, claim) in ["INVOICE_ISSUED", "SERVICE_CONFIRMED", "OWNER_APPROVED"]
        .iter()
        .enumerate()
    {
        let who = if i == 2 { owner } else { verifier };
        call(who,c,"attest_proposal",json!({"evidence":{"protocol_version":1,"network_id":"testnet","vault_account":c.id(),"mandate_id":id(m),"policy_version":1,"proposal_id":id(n),"asset_id":"NativeNear","recipient":recipient,"amount_atomic":amount.to_string(),"claim_type":claim,"evidence_digest":"a".repeat(64),"verifier_account":who.id(),"nonce":id(n*10+i as u32),"issued_at_ns":"1","expires_at_ns":"2000000000000000000"}}),if i==2 {1}else{0}).await?.into_result()?;
    }
    Ok(())
}
#[tokio::test]
async fn native_transfers_rollback_authority_and_conservation() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let wasm = std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/wasm32-unknown-unknown/release/mandate_vault.wasm"
    ))?;
    let c = worker.dev_deploy(&wasm).await?;
    let owner = worker.dev_create_account().await?;
    let agent = worker.dev_create_account().await?;
    let verifier = worker.dev_create_account().await?;
    let recipient = worker.dev_create_account().await?;
    let intruder = worker.dev_create_account().await?;
    reject(
        &intruder,
        &c,
        "new",
        json!({"network":"testnet"}),
        0,
        "UNAUTHORIZED",
    )
    .await?;
    c.call("new")
        .args_json(json!({"network":"testnet"}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    let base = view(&c, "get_accounting", json!({})).await?;
    println!(
        "local sandbox base storage bytes={}, byte cost={}",
        base["storage_usage_bytes"], base["storage_byte_cost"]
    );
    call(
        &owner,
        &c,
        "storage_deposit",
        json!({}),
        NearToken::from_near(2).as_yoctonear(),
    )
    .await?
    .into_result()?;
    let unit = NearToken::from_millinear(1).as_yoctonear();
    register(
        &c,
        (&owner, &agent, &verifier),
        recipient.id().as_str(),
        1,
        unit * 10,
        2,
    )
    .await?;
    call(
        &owner,
        &c,
        "fund_mandate",
        json!({"mandate_id":id(1)}),
        unit * 3,
    )
    .await?
    .into_result()?;
    let before = view(&c, "get_mandate", json!({"mandate_id":id(1)})).await?;
    reject(
        &intruder,
        &c,
        "fund_mandate",
        json!({"mandate_id":id(1)}),
        unit,
        "UNAUTHORIZED",
    )
    .await?;
    reject(
        &agent,
        &c,
        "withdraw_available",
        json!({"mandate_id":id(1),"amount":unit.to_string()}),
        1,
        "UNAUTHORIZED",
    )
    .await?;
    reject(
        &owner,
        &c,
        "fund_mandate",
        json!({"mandate_id":id(1)}),
        unit * 10,
        "EXCESS_FUNDING",
    )
    .await?;
    assert_eq!(
        before,
        view(&c, "get_mandate", json!({"mandate_id":id(1)})).await?
    );
    prepare(
        &c,
        (&owner, &agent, &verifier),
        recipient.id().as_str(),
        1,
        11,
        unit * 2,
    )
    .await?;
    let recipient_before = recipient.view_account().await?.balance.as_yoctonear();
    let r = call(
        &owner,
        &c,
        "authorize_and_execute",
        json!({"mandate_id":id(1),"proposal_id":id(11)}),
        1,
    )
    .await?;
    assert!(r.is_success());
    assert!(r.receipt_failures().is_empty());
    println!(
        "local sandbox settlement: transaction={}, receipt_count={}, gas_burnt={}",
        r.outcome().transaction_hash,
        r.receipt_outcomes().len(),
        r.total_gas_burnt.as_gas()
    );
    assert_eq!(
        recipient.view_account().await?.balance.as_yoctonear() - recipient_before,
        unit * 2
    );
    let m = view(&c, "get_mandate", json!({"mandate_id":id(1)})).await?;
    assert_eq!(m["spent"], (unit * 2).to_string());
    assert_eq!(m["reserved"], "0");
    assert_eq!(m["available"], unit.to_string());
    reject(
        &owner,
        &c,
        "authorize_and_execute",
        json!({"mandate_id":id(1),"proposal_id":id(11)}),
        1,
        "PROPOSAL_TERMINAL",
    )
    .await?;
    reject(
        &intruder,
        &c,
        "on_settlement_result",
        json!({"mandate_id":id(1),"proposal_id":id(11)}),
        0,
        "private",
    )
    .await?;
    prepare(
        &c,
        (&owner, &agent, &verifier),
        recipient.id().as_str(),
        1,
        12,
        unit * 2,
    )
    .await?;
    let before = view(&c, "get_mandate", json!({"mandate_id":id(1)})).await?;
    reject(
        &owner,
        &c,
        "authorize_and_execute",
        json!({"mandate_id":id(1),"proposal_id":id(12)}),
        1,
        "UNDERFLOW",
    )
    .await?;
    assert_eq!(
        before,
        view(&c, "get_mandate", json!({"mandate_id":id(1)})).await?
    );
    // Failure is a real native transfer to a nonexistent named subaccount.
    let missing = format!("missing.{}", recipient.id());
    register(&c, (&owner, &agent, &verifier), &missing, 2, unit * 10, 2).await?;
    call(
        &owner,
        &c,
        "fund_mandate",
        json!({"mandate_id":id(2)}),
        unit,
    )
    .await?
    .into_result()?;
    prepare(&c, (&owner, &agent, &verifier), &missing, 2, 21, unit).await?;
    let failed = call(
        &owner,
        &c,
        "authorize_and_execute",
        json!({"mandate_id":id(2),"proposal_id":id(21)}),
        1,
    )
    .await?;
    assert!(!failed.receipt_failures().is_empty());
    assert!(!failed.json::<bool>()?);
    let m = view(&c, "get_mandate", json!({"mandate_id":id(2)})).await?;
    assert_eq!(m["available"], unit.to_string());
    assert_eq!(m["spent"], "0");
    assert_eq!(m["reserved"], "0");
    assert_eq!(m["pending_count"], 0);
    reject(
        &owner,
        &c,
        "authorize_and_execute",
        json!({"mandate_id":id(2),"proposal_id":id(21)}),
        1,
        "PROPOSAL_TERMINAL",
    )
    .await?;
    call(&agent, &c, "pause_mandate", json!({"mandate_id":id(1)}), 1)
        .await?
        .into_result()?;
    reject(
        &agent,
        &c,
        "resume_mandate",
        json!({"mandate_id":id(1)}),
        1,
        "UNAUTHORIZED",
    )
    .await?;
    call(&owner, &c, "revoke_mandate", json!({"mandate_id":id(1)}), 1)
        .await?
        .into_result()?;
    reject(
        &owner,
        &c,
        "authorize_and_execute",
        json!({"mandate_id":id(1),"proposal_id":id(12)}),
        1,
        "NOT_ACTIVE",
    )
    .await?;
    call(
        &owner,
        &c,
        "withdraw_available",
        json!({"mandate_id":id(1),"amount":unit.to_string()}),
        1,
    )
    .await?
    .into_result()?;
    let m = view(&c, "get_mandate", json!({"mandate_id":id(1)})).await?;
    assert_eq!(m["withdrawn"], unit.to_string());
    assert_eq!(m["available"], "0");
    assert_eq!(m["withdrawal_pending"], "0");
    // Other mandate still has its independent restored funds.
    assert_eq!(
        view(&c, "get_mandate", json!({"mandate_id":id(2)})).await?["available"],
        unit.to_string()
    );
    call(
        &owner,
        &c,
        "withdraw_storage_credit",
        json!({"amount":unit.to_string()}),
        1,
    )
    .await?
    .into_result()?;
    // Two concurrent executions contend for one funded allocation. Atomic
    // receipt execution must permit exactly one, regardless of RPC ordering.
    register(
        &c,
        (&owner, &agent, &verifier),
        recipient.id().as_str(),
        3,
        unit * 2,
        3,
    )
    .await?;
    call(
        &owner,
        &c,
        "fund_mandate",
        json!({"mandate_id":id(3)}),
        unit,
    )
    .await?
    .into_result()?;
    prepare(
        &c,
        (&owner, &agent, &verifier),
        recipient.id().as_str(),
        3,
        31,
        unit,
    )
    .await?;
    prepare(
        &c,
        (&owner, &agent, &verifier),
        recipient.id().as_str(),
        3,
        32,
        unit,
    )
    .await?;
    let (a, b) = tokio::join!(
        call(
            &owner,
            &c,
            "authorize_and_execute",
            json!({"mandate_id":id(3),"proposal_id":id(31)}),
            1
        ),
        call(
            &owner,
            &c,
            "authorize_and_execute",
            json!({"mandate_id":id(3),"proposal_id":id(32)}),
            1
        )
    );
    assert_eq!(u8::from(a?.is_success()) + u8::from(b?.is_success()), 1);
    let m = view(&c, "get_mandate", json!({"mandate_id":id(3)})).await?;
    assert_eq!(m["spent"], unit.to_string());
    assert_eq!(m["available"], "0");
    assert_eq!(m["reserved"], "0");
    // Storage-budget failure must roll back the newly written policy record.
    let mut p: Policy = near_sdk::serde_json::from_str(include_str!(
        "../../../tests/fixtures/m3-policy.canonical.txt"
    ))?;
    p.mandate_id = id(4);
    p.owner_account = owner.id().to_string().parse()?;
    p.vault_account = c.id().to_string().parse()?;
    let bytes = near_sdk::serde_json::to_string(&p)?;
    let digest = format!("{:x}", Sha256::digest(bytes.as_bytes()));
    let credit_before = view(&c, "get_storage_credit", json!({"account_id":owner.id()})).await?;
    reject(&owner,&c,"register_mandate",json!({"canonical_policy":bytes,"expected_digest":digest,"guardian":null,"storage_limit":"1"}),1,"MANDATE_STORAGE_LIMIT").await?;
    assert!(
        view(&c, "get_mandate", json!({"mandate_id":id(4)}))
            .await?
            .is_null()
    );
    assert_eq!(
        credit_before,
        view(&c, "get_storage_credit", json!({"account_id":owner.id()})).await?
    );
    // Independent second owner: same contract, no authority over first owner's funds.
    call(
        &intruder,
        &c,
        "storage_deposit",
        json!({}),
        NearToken::from_near(1).as_yoctonear(),
    )
    .await?
    .into_result()?;
    register(
        &c,
        (&intruder, &agent, &verifier),
        recipient.id().as_str(),
        5,
        unit * 2,
        2,
    )
    .await?;
    call(
        &intruder,
        &c,
        "fund_mandate",
        json!({"mandate_id":id(5)}),
        unit,
    )
    .await?
    .into_result()?;
    reject(
        &owner,
        &c,
        "withdraw_available",
        json!({"mandate_id":id(5),"amount":unit.to_string()}),
        1,
        "UNAUTHORIZED",
    )
    .await?;
    assert_eq!(
        view(&c, "get_mandate", json!({"mandate_id":id(5)})).await?["available"],
        unit.to_string()
    );
    let a = view(&c, "get_accounting", json!({})).await?;
    println!(
        "local sandbox measured storage bytes: {}",
        a["storage_usage_bytes"]
    );
    Ok(())
}
