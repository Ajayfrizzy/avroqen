//! Local sandbox only: never reads wallet credentials or connects to public Testnet.
use near_sdk::serde_json::{Value, json};
use near_workspaces::{
    Account,
    operations::Function,
    types::{Gas, KeyType, NearToken, SecretKey},
};
use sha2::{Digest, Sha256};

const APPROVED_HASH: &str = "b2ce7469301f8de912a4af955e254fa4ff2d9a5c097411bde1d00d0dd450ef48";
// Freeze the reviewed bytes across hosts: Cargo embeds local dependency paths.
// Existing sandbox.rs independently exercises each host's freshly built artifact.
fn artifact() -> Vec<u8> {
    let bytes = std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../docs/evidence/mandate-vault-approved.wasm"
    ))
    .unwrap();
    assert_eq!(format!("{:x}", Sha256::digest(&bytes)), APPROVED_HASH);
    assert_eq!(bytes.len(), 366735);
    bytes
}
async fn vault(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    balance: u128,
) -> anyhow::Result<Account> {
    let parent = worker
        .create_tla("testnet".parse()?, SecretKey::from_random(KeyType::ED25519))
        .await?
        .into_result()?;
    Ok(parent
        .create_subaccount("avroqen-vault")
        .initial_balance(NearToken::from_yoctonear(balance))
        .transact()
        .await?
        .into_result()?)
}
fn init(network: &str) -> Function {
    Function::new("new")
        .args_json(json!({"network": network}))
        .gas(Gas::from_tgas(100))
        .deposit(NearToken::from_yoctonear(0))
}
async fn key_permissions(a: &Account) -> anyhow::Result<Vec<String>> {
    Ok(a.view_access_keys()
        .await?
        .into_iter()
        .map(|k| format!("{}:{:?}", k.public_key, k.access_key.permission))
        .collect())
}
#[tokio::test]
async fn atomic_approved_deployment_at_observed_balance() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let a = vault(&worker, 4_500_000_000_000_000_000_000_000).await?;
    let wasm = artifact();
    let before = a.view_account().await?;
    let keys = key_permissions(&a).await?;
    assert_eq!(before.contract_state, Default::default());
    // Exactly two actions in one transaction. Signer = receiver = predecessor.
    let outcome = a
        .batch(a.id())
        .deploy(&wasm)
        .call(init("testnet"))
        .transact()
        .await?;
    assert!(outcome.is_success(), "atomic initialization failed");
    let gas = outcome.total_gas_burnt.as_gas();
    let burned: u128 = outcome
        .outcomes()
        .iter()
        .map(|o| o.tokens_burnt.as_yoctonear())
        .sum();
    assert_eq!(worker.view_code(a.id()).await?, wasm);
    assert_eq!(key_permissions(&a).await?, keys);
    let accounting: Value = a
        .view(a.id(), "get_accounting")
        .args_json(json!({}))
        .await?
        .json()?;
    assert_eq!(accounting["network"], "testnet");
    assert_eq!(accounting["vault"], "avroqen-vault.testnet");
    for field in [
        "available",
        "payment_reserved",
        "withdrawal_pending",
        "storage_credit",
        "storage_locked",
        "unallocated_owner_balance",
    ] {
        assert_eq!(accounting[field], "0");
    }
    // Include the asynchronously delivered unused-gas refund in balance evidence.
    worker.fast_forward(5).await?;
    let after = a.view_account().await?;
    let reserve = accounting["protocol_reserve_minimum"]
        .as_str()
        .unwrap()
        .parse::<u128>()?;
    assert_eq!(reserve, NearToken::from_millinear(100).as_yoctonear());
    let storage = (after.storage_usage as u128)
        .checked_mul(
            accounting["storage_byte_cost"]
                .as_str()
                .unwrap()
                .parse::<u128>()?,
        )
        .unwrap();
    assert!(after.balance.as_yoctonear() >= storage.checked_add(reserve).unwrap());
    assert_eq!(after.locked.as_yoctonear(), 0);
    assert_eq!(
        before.balance.as_yoctonear() - after.balance.as_yoctonear(),
        burned,
        "only actual gas may leave the self-deploying account after refunds"
    );
    println!(
        "SANDBOX_PREFLIGHT {}",
        json!({"scope":"local sandbox only", "artifactSha256":APPROVED_HASH,"gasBurnt":gas.to_string(),"tokensBurnt":burned.to_string(),"balanceBefore":before.balance.as_yoctonear().to_string(),"balanceAfter":after.balance.as_yoctonear().to_string(),"storageBefore":before.storage_usage,"storageAfter":after.storage_usage,"reserve":reserve.to_string(),"storageBacking":storage.to_string()})
    );
    let repeat = a.batch(a.id()).call(init("testnet")).transact().await?;
    assert!(repeat.is_failure());
    assert!(format!("{:?}", repeat.failures()).contains("already been initialized"));
    assert_eq!(worker.view_code(a.id()).await?, wasm);
    Ok(())
}
#[tokio::test]
async fn failed_atomic_initialization_rolls_back_code_and_state() -> anyhow::Result<()> {
    for (network, balance, reason) in [
        (
            "mainnet",
            4_500_000_000_000_000_000_000_000,
            "NETWORK_NOT_SUPPORTED",
        ),
        (
            "testnet",
            3_700_000_000_000_000_000_000_000,
            "INSUFFICIENT_LIQUID_BACKING",
        ),
    ] {
        let worker = near_workspaces::sandbox().await?;
        let a = vault(&worker, balance).await?;
        let before = a.view_account().await?;
        let keys = key_permissions(&a).await?;
        let result = a
            .batch(a.id())
            .deploy(&artifact())
            .call(init(network))
            .transact()
            .await?;
        assert!(result.is_failure());
        assert!(
            format!("{:?}", result.failures()).contains(reason),
            "unexpected failure: {:?}",
            result.failures()
        );
        assert_eq!(
            a.view_account().await?.contract_state,
            Default::default(),
            "failed initialization left code deployed"
        );
        assert!(
            a.view(a.id(), "get_accounting")
                .args_json(json!({}))
                .await
                .is_err()
        );
        assert_eq!(a.view_account().await?.storage_usage, before.storage_usage);
        assert_eq!(key_permissions(&a).await?, keys);
        println!(
            "SANDBOX_PREFLIGHT_FAILURE {}",
            json!({"scope":"local sandbox only","reason":reason,"codeRolledBack":true,"storageUnchanged":true,"keysUnchanged":true,"gasBurnt":result.total_gas_burnt.as_gas().to_string()})
        );
    }
    Ok(())
}
