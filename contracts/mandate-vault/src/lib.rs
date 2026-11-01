//! M0 scaffold only. No custody, deposit, transfer, callback or upgrade interface.
use near_sdk::near;

#[near(contract_state)]
#[derive(Default)]
pub struct MandateVault {}

#[near]
impl MandateVault {
    /// An explicit capability flag; never settlement evidence.
    pub fn payments_enabled(&self) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn foundation_does_not_offer_payments() {
        assert!(!MandateVault::default().payments_enabled());
    }
}
