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
    one_winner(a?, b?, "UNDERFLOW");
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

// Review fixtures create only ephemeral valueless sandbox accounts. No public RPC.
struct ReviewVault {
    worker: near_workspaces::Worker<near_workspaces::network::Sandbox>,
    c: Contract,
    owner: Account,
    agent: Account,
    verifier: Account,
    recipient: Account,
}
impl ReviewVault {
    async fn new(wasm: &[u8]) -> anyhow::Result<Self> {
        let worker = near_workspaces::sandbox().await?;
        let c = worker.dev_deploy(wasm).await?;
        c.call("new")
            .args_json(json!({"network":"testnet"}))
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
            &c,
            "storage_deposit",
            json!({}),
            NearToken::from_near(2).as_yoctonear(),
        )
        .await?
        .into_result()?;
        Ok(Self {
            worker,
            c,
            owner,
            agent,
            verifier,
            recipient,
        })
    }
    async fn funded(&self, n: u32, amount: u128, slots: u32) -> anyhow::Result<()> {
        register(
            &self.c,
            (&self.owner, &self.agent, &self.verifier),
            self.recipient.id().as_str(),
            n,
            amount,
            slots,
        )
        .await?;
        call(
            &self.owner,
            &self.c,
            "fund_mandate",
            json!({"mandate_id":id(n)}),
            amount,
        )
        .await?
        .into_result()?;
        Ok(())
    }
    async fn proposal(&self, m: u32, n: u32, amount: u128) -> anyhow::Result<()> {
        prepare(
            &self.c,
            (&self.owner, &self.agent, &self.verifier),
            self.recipient.id().as_str(),
            m,
            n,
            amount,
        )
        .await
    }
    async fn mandate(&self, n: u32) -> anyhow::Result<Value> {
        view(&self.c, "get_mandate", json!({"mandate_id":id(n)})).await
    }
}
fn artifact() -> Vec<u8> {
    std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/wasm32-unknown-unknown/release/mandate_vault.wasm"
    ))
    .unwrap()
}
fn one_winner(
    a: near_workspaces::result::ExecutionFinalResult,
    b: near_workspaces::result::ExecutionFinalResult,
    error: &str,
) {
    let (success, failure) = if a.is_success() { (a, b) } else { (b, a) };
    assert!(success.is_success());
    assert!(success.receipt_failures().is_empty());
    assert!(failure.is_failure());
    assert!(format!("{:?}", failure.failures()).contains(error));
}
fn atomic(v: &Value) -> u128 {
    v.as_str().unwrap().parse().unwrap()
}
fn conserved(m: &Value) {
    assert_eq!(
        atomic(&m["deposited"]),
        [
            "available",
            "reserved",
            "spent",
            "withdrawal_pending",
            "withdrawn"
        ]
        .iter()
        .map(|k| atomic(&m[k]))
        .sum::<u128>()
    );
    assert!(
        atomic(&m["spent"]) + atomic(&m["reserved"]) <= atomic(&m["policy"]["totalBudgetAtomic"])
    );
    assert!(
        m["pending_count"].as_u64().unwrap() + m["successful_count"].as_u64().unwrap()
            <= m["policy"]["maxExecutions"].as_u64().unwrap()
    );
}

#[tokio::test]
async fn execution_slots_and_withdrawal_races_preserve_conservation() -> anyhow::Result<()> {
    let v = ReviewVault::new(&artifact()).await?;
    let unit = NearToken::from_millinear(1).as_yoctonear();
    // Enough funds for both proposals: only the execution-slot ceiling denies one.
    v.funded(60, unit * 2, 1).await?;
    v.proposal(60, 601, unit).await?;
    v.proposal(60, 602, unit).await?;
    let before = v.recipient.view_account().await?.balance.as_yoctonear();
    let (a, b) = tokio::join!(
        call(
            &v.owner,
            &v.c,
            "authorize_and_execute",
            json!({"mandate_id":id(60),"proposal_id":id(601)}),
            1
        ),
        call(
            &v.owner,
            &v.c,
            "authorize_and_execute",
            json!({"mandate_id":id(60),"proposal_id":id(602)}),
            1
        )
    );
    let (a, b) = (a?, b?);
    assert_eq!(u8::from(a.is_success()) + u8::from(b.is_success()), 1);
    let failure = if a.is_failure() { a } else { b };
    assert!(format!("{:?}", failure.failures()).contains("EXECUTION_LIMIT"));
    assert_eq!(
        v.recipient.view_account().await?.balance.as_yoctonear() - before,
        unit
    );
    let m = v.mandate(60).await?;
    conserved(&m);
    assert_eq!(m["successful_count"], 1);
    assert_eq!(m["available"], unit.to_string());
    // Payment competes with withdrawal for the same deposited funds.
    v.funded(61, unit, 2).await?;
    v.proposal(61, 611, unit).await?;
    let (a, b) = tokio::join!(
        call(
            &v.owner,
            &v.c,
            "authorize_and_execute",
            json!({"mandate_id":id(61),"proposal_id":id(611)}),
            1
        ),
        call(
            &v.owner,
            &v.c,
            "withdraw_available",
            json!({"mandate_id":id(61),"amount":unit.to_string()}),
            1
        )
    );
    one_winner(a?, b?, "UNDERFLOW");
    let m = v.mandate(61).await?;
    conserved(&m);
    assert_eq!(atomic(&m["spent"]) + atomic(&m["withdrawn"]), unit);
    assert_eq!(m["available"], "0");
    // Two withdrawals cannot redeem the same allocation twice.
    v.funded(62, unit, 2).await?;
    let (a, b) = tokio::join!(
        call(
            &v.owner,
            &v.c,
            "withdraw_available",
            json!({"mandate_id":id(62),"amount":unit.to_string()}),
            1
        ),
        call(
            &v.owner,
            &v.c,
            "withdraw_available",
            json!({"mandate_id":id(62),"amount":unit.to_string()}),
            1
        )
    );
    one_winner(a?, b?, "UNDERFLOW");
    let m = v.mandate(62).await?;
    conserved(&m);
    assert_eq!(m["withdrawn"], unit.to_string());
    assert_eq!(m["withdrawal_pending"], "0");
    // Refunding/redepositing cannot reset successful slots or spent totals.
    call(
        &v.owner,
        &v.c,
        "fund_mandate",
        json!({"mandate_id":id(62)}),
        unit,
    )
    .await?
    .into_result()?;
    conserved(&v.mandate(62).await?);
    reject(
        &v.owner,
        &v.c,
        "fund_mandate",
        json!({"mandate_id":id(60)}),
        unit,
        "EXCESS_FUNDING",
    )
    .await?;
    Ok(())
}

// Fault injection ONLY in test memory: rename callback exports, preserving the
// actual transfer, reservation and callback implementation bytes. This simulates
// a missing callback receipt; it does not claim the production artifact is broken.
fn without_callback_exports(mut bytes: Vec<u8>) -> Vec<u8> {
    fn leb(b: &[u8], p: &mut usize) -> usize {
        let mut v = 0;
        let mut shift = 0;
        loop {
            let n = b[*p];
            *p += 1;
            v |= ((n & 127) as usize) << shift;
            if n & 128 == 0 {
                return v;
            }
            shift += 7;
            assert!(shift <= 28);
        }
    }
    assert_eq!(&bytes[..8], b"\0asm\x01\0\0\0");
    let mut pos = 8;
    let mut changed = 0;
    while pos < bytes.len() {
        let section = bytes[pos];
        pos += 1;
        let len = leb(&bytes, &mut pos);
        let end = pos + len;
        if section == 7 {
            let count = leb(&bytes, &mut pos);
            for _ in 0..count {
                let n = leb(&bytes, &mut pos);
                let start = pos;
                pos += n;
                let target = matches!(
                    &bytes[start..pos],
                    b"on_settlement_result" | b"on_withdrawal_result"
                );
                let kind = bytes[pos];
                pos += 1;
                leb(&bytes, &mut pos);
                if target {
                    assert_eq!(kind, 0);
                    bytes[start] = b'x';
                    bytes[start + 1] = b'x';
                    changed += 1;
                }
            }
        }
        pos = end;
    }
    assert_eq!(changed, 2);
    bytes
}
#[tokio::test]
async fn missing_callbacks_quarantine_real_transfers_and_withdrawals() -> anyhow::Result<()> {
    let v = ReviewVault::new(&without_callback_exports(artifact())).await?;
    let unit = NearToken::from_millinear(1).as_yoctonear();
    v.funded(70, unit * 2, 1).await?;
    v.proposal(70, 701, unit).await?;
    let before = v.recipient.view_account().await?.balance.as_yoctonear();
    let r = call(
        &v.owner,
        &v.c,
        "authorize_and_execute",
        json!({"mandate_id":id(70),"proposal_id":id(701)}),
        1,
    )
    .await?;
    assert!(r.is_failure());
    assert_eq!(r.receipt_failures().len(), 1, "Only the callback may fail");
    assert_eq!(&r.receipt_failures()[0].executor_id, v.c.id());
    assert!(format!("{:?}", r.failures()).contains("MethodNotFound"));
    assert_eq!(
        v.recipient.view_account().await?.balance.as_yoctonear() - before,
        unit
    );
    let m = v.mandate(70).await?;
    conserved(&m);
    assert_eq!(m["reserved"], unit.to_string());
    assert_eq!(m["spent"], "0");
    assert_eq!(m["pending_count"], 1);
    reject(
        &v.owner,
        &v.c,
        "withdraw_available",
        json!({"mandate_id":id(70),"amount":(unit*2).to_string()}),
        1,
        "UNDERFLOW",
    )
    .await?;
    v.proposal(70, 702, unit).await?;
    reject(
        &v.owner,
        &v.c,
        "authorize_and_execute",
        json!({"mandate_id":id(70),"proposal_id":id(702)}),
        1,
        "EXECUTION_LIMIT",
    )
    .await?;
    let r = call(
        &v.owner,
        &v.c,
        "withdraw_available",
        json!({"mandate_id":id(70),"amount":unit.to_string()}),
        1,
    )
    .await?;
    assert!(r.is_failure());
    assert_eq!(r.receipt_failures().len(), 1, "Only the callback may fail");
    assert_eq!(&r.receipt_failures()[0].executor_id, v.c.id());
    assert!(format!("{:?}", r.failures()).contains("MethodNotFound"));
    let m = v.mandate(70).await?;
    conserved(&m);
    assert_eq!(m["withdrawal_pending"], unit.to_string());
    assert_eq!(m["withdrawn"], "0");
    assert_eq!(m["available"], "0");
    let credit_before = view(
        &v.c,
        "get_storage_credit",
        json!({"account_id":v.owner.id()}),
    )
    .await?;
    let r = call(
        &v.owner,
        &v.c,
        "withdraw_storage_credit",
        json!({"amount":unit.to_string()}),
        1,
    )
    .await?;
    assert!(r.is_failure());
    assert_eq!(r.receipt_failures().len(), 1, "Only the callback may fail");
    assert_eq!(&r.receipt_failures()[0].executor_id, v.c.id());
    let credit_after = view(
        &v.c,
        "get_storage_credit",
        json!({"account_id":v.owner.id()}),
    )
    .await?;
    let storage_cost = atomic(&credit_after["locked"]) - atomic(&credit_before["locked"]);
    assert_eq!(
        atomic(&credit_before["available"]) - atomic(&credit_after["available"]),
        unit + storage_cost
    );
    let a = view(&v.c, "get_accounting", json!({})).await?;
    assert_eq!(a["withdrawal_pending"], (unit * 2).to_string());
    v.worker.fast_forward(100).await?;
    assert_eq!(m, v.mandate(70).await?);
    reject(
        &v.owner,
        &v.c,
        "authorize_and_execute",
        json!({"mandate_id":id(70),"proposal_id":id(701)}),
        1,
        "PROPOSAL_TERMINAL",
    )
    .await?;
    reject(
        &v.owner,
        &v.c,
        "withdraw_available",
        json!({"mandate_id":id(70),"amount":unit.to_string()}),
        1,
        "UNDERFLOW",
    )
    .await?;
    assert_eq!(
        view(&v.c, "get_withdrawal", json!({"withdrawal_id":"0"})).await?["outcome"],
        "Pending"
    );
    assert_eq!(
        view(&v.c, "get_withdrawal", json!({"withdrawal_id":"1"})).await?["outcome"],
        "Pending"
    );
    Ok(())
}

#[tokio::test]
async fn storage_backing_insolvency_and_initialization_fail_closed() -> anyhow::Result<()> {
    let v = ReviewVault::new(&artifact()).await?;
    let unit = NearToken::from_millinear(1).as_yoctonear();
    v.funded(80, unit, 1).await?;
    v.proposal(80, 801, unit).await?;
    reject(
        v.c.as_account(),
        &v.c,
        "new",
        json!({"network":"testnet"}),
        0,
        "already been initialized",
    )
    .await?;
    reject(
        v.c.as_account(),
        &v.c,
        "on_settlement_result",
        json!({"mandate_id":id(80),"proposal_id":id(801)}),
        0,
        "ONE_RESULT_REQUIRED",
    )
    .await?;
    reject(
        &v.owner,
        &v.c,
        "on_withdrawal_result",
        json!({"withdrawal_id":"0"}),
        0,
        "private",
    )
    .await?;
    let c = view(
        &v.c,
        "get_storage_credit",
        json!({"account_id":v.owner.id()}),
    )
    .await?;
    // Locked backing cannot be withdrawn; even all unlocked credit must leave
    // enough to pay the new withdrawal record's measured storage.
    for amount in [
        atomic(&c["available"]) + atomic(&c["locked"]),
        atomic(&c["available"]),
    ] {
        reject(
            &v.owner,
            &v.c,
            "withdraw_storage_credit",
            json!({"amount":amount.to_string()}),
            1,
            "UNDERFLOW",
        )
        .await?;
        assert_eq!(
            c,
            view(
                &v.c,
                "get_storage_credit",
                json!({"account_id":v.owner.id()})
            )
            .await?
        );
        assert!(
            view(&v.c, "get_withdrawal", json!({"withdrawal_id":"0"}))
                .await?
                .is_null()
        );
    }
    // Inject a deficit through sandbox-only account patching, not a reachable
    // contract operation. Every outgoing call must reject and roll back.
    let a = view(&v.c, "get_accounting", json!({})).await?;
    assert_eq!(a["storage_credit"], c["available"]);
    assert_eq!(a["storage_locked"], c["locked"]);
    assert_eq!(a["available"], unit.to_string());
    let needed = atomic(&a["available"])
        + atomic(&a["storage_credit"])
        + atomic(&a["storage_usage_bytes"]) * atomic(&a["storage_byte_cost"])
        + atomic(&a["protocol_reserve_minimum"]);
    v.worker
        .patch(v.c.id())
        .account_from_current(move |current| {
            near_workspaces::types::AccountDetailsPatch::from(current).balance(
                NearToken::from_yoctonear(needed - NearToken::from_millinear(500).as_yoctonear()),
            )
        })
        .transact()
        .await?;
    let m = v.mandate(80).await?;
    reject(
        &v.owner,
        &v.c,
        "authorize_and_execute",
        json!({"mandate_id":id(80),"proposal_id":id(801)}),
        1,
        "INSUFFICIENT_LIQUID_BACKING",
    )
    .await?;
    reject(
        &v.owner,
        &v.c,
        "withdraw_available",
        json!({"mandate_id":id(80),"amount":unit.to_string()}),
        1,
        "INSUFFICIENT_LIQUID_BACKING",
    )
    .await?;
    reject(
        &v.owner,
        &v.c,
        "withdraw_storage_credit",
        json!({"amount":unit.to_string()}),
        1,
        "INSUFFICIENT_LIQUID_BACKING",
    )
    .await?;
    assert_eq!(m, v.mandate(80).await?);
    assert_eq!(
        c,
        view(
            &v.c,
            "get_storage_credit",
            json!({"account_id":v.owner.id()})
        )
        .await?
    );
    assert!(
        view(&v.c, "get_withdrawal", json!({"withdrawal_id":"0"}))
            .await?
            .is_null()
    );
    Ok(())
}

#[tokio::test]
async fn distinct_roles_cannot_escalate_or_forge_owner_approval() -> anyhow::Result<()> {
    let v = ReviewVault::new(&artifact()).await?;
    let guardian = v.worker.dev_create_account().await?;
    let mut p: Policy = near_sdk::serde_json::from_str(include_str!(
        "../../../tests/fixtures/m3-policy.canonical.txt"
    ))?;
    p.mandate_id = id(90);
    p.owner_account = v.owner.id().to_string().parse()?;
    p.agent_account = v.agent.id().to_string().parse()?;
    p.vault_account = v.c.id().to_string().parse()?;
    p.recipient = v.recipient.id().to_string().parse()?;
    p.verifier_policy.accounts = vec![v.verifier.id().to_string().parse()?];
    let bytes = near_sdk::serde_json::to_string(&p)?;
    let digest = format!("{:x}", Sha256::digest(bytes.as_bytes()));
    reject(&guardian,&v.c,"register_mandate",json!({"canonical_policy":bytes,"expected_digest":digest,"guardian":guardian.id(),"storage_limit":NearToken::from_near(1).as_yoctonear().to_string()}),1,"UNAUTHORIZED").await?;
    call(&v.owner,&v.c,"register_mandate",json!({"canonical_policy":bytes,"expected_digest":digest,"guardian":guardian.id(),"storage_limit":NearToken::from_near(1).as_yoctonear().to_string()}),1).await?.into_result()?;
    call(
        &v.owner,
        &v.c,
        "fund_mandate",
        json!({"mandate_id":id(90)}),
        1000,
    )
    .await?
    .into_result()?;
    for who in [&v.agent, &v.verifier, &guardian] {
        for method in ["revoke_mandate", "resume_mandate"] {
            reject(
                who,
                &v.c,
                method,
                json!({"mandate_id":id(90)}),
                1,
                "UNAUTHORIZED",
            )
            .await?;
        }
        reject(
            who,
            &v.c,
            "fund_mandate",
            json!({"mandate_id":id(90)}),
            1,
            "UNAUTHORIZED",
        )
        .await?;
        reject(
            who,
            &v.c,
            "authorize_and_execute",
            json!({"mandate_id":id(90),"proposal_id":id(901)}),
            1,
            "UNAUTHORIZED",
        )
        .await?;
        reject(
            who,
            &v.c,
            "withdraw_available",
            json!({"mandate_id":id(90),"amount":"400"}),
            1,
            "UNAUTHORIZED",
        )
        .await?;
    }
    reject(&v.verifier,&v.c,"submit_proposal",json!({"mandate_id":id(90),"proposal_id":id(901),"recipient":v.recipient.id(),"amount":"400","evidence_digest":"a".repeat(64)}),0,"UNAUTHORIZED").await?;
    call(&v.agent,&v.c,"submit_proposal",json!({"mandate_id":id(90),"proposal_id":id(901),"recipient":v.recipient.id(),"amount":"400","evidence_digest":"a".repeat(64)}),0).await?.into_result()?;
    let mut e = json!({"protocol_version":1,"network_id":"testnet","vault_account":v.c.id(),"mandate_id":id(90),"policy_version":1,"proposal_id":id(901),"asset_id":"NativeNear","recipient":v.recipient.id(),"amount_atomic":"400","claim_type":"OWNER_APPROVED","evidence_digest":"a".repeat(64),"verifier_account":v.verifier.id(),"nonce":id(902),"issued_at_ns":"1","expires_at_ns":"2000000000000000000"});
    reject(
        &v.verifier,
        &v.c,
        "attest_proposal",
        json!({"evidence":e}),
        1,
        "UNAUTHORIZED",
    )
    .await?;
    e["claim_type"] = json!("SERVICE_CONFIRMED");
    e["verifier_account"] = json!(guardian.id());
    reject(
        &guardian,
        &v.c,
        "attest_proposal",
        json!({"evidence":e}),
        0,
        "UNAUTHORIZED_VERIFIER",
    )
    .await?;
    assert!(
        view(
            &v.c,
            "get_proposal",
            json!({"mandate_id":id(90),"proposal_id":id(901)})
        )
        .await?["attestations"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    reject(
        &v.owner,
        &v.c,
        "pause_mandate",
        json!({"mandate_id":id(90)}),
        0,
        "ONE_YOCTO_REQUIRED",
    )
    .await?;
    call(
        &guardian,
        &v.c,
        "pause_mandate",
        json!({"mandate_id":id(90)}),
        1,
    )
    .await?
    .into_result()?;
    reject(
        &guardian,
        &v.c,
        "resume_mandate",
        json!({"mandate_id":id(90)}),
        1,
        "UNAUTHORIZED",
    )
    .await?;
    call(
        &v.owner,
        &v.c,
        "resume_mandate",
        json!({"mandate_id":id(90)}),
        1,
    )
    .await?
    .into_result()?;
    let m = v.mandate(90).await?;
    conserved(&m);
    assert_eq!(m["available"], "1000");
    assert_eq!(m["spent"], "0");
    Ok(())
}
