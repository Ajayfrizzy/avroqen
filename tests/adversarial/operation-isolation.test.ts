import { expect, it } from "vitest";
import {
  accountStorageOperationKinds,
  isAccountStorageOperation,
  operationInput,
} from "../../packages/domain/src/settlement.js";

it("limits account-global isolation to contract storage-credit operations", () => {
  expect(accountStorageOperationKinds).toEqual([
    "STORAGE_DEPOSIT",
    "WITHDRAW_STORAGE",
  ]);
  for (const operation of operationInput.options) {
    const kind = operation.shape.kind.value;
    expect(isAccountStorageOperation(kind), kind).toBe(
      kind === "STORAGE_DEPOSIT" || kind === "WITHDRAW_STORAGE",
    );
  }
  expect(isAccountStorageOperation("REGISTER")).toBe(false);
  expect(isAccountStorageOperation("FUND")).toBe(false);
  expect(isAccountStorageOperation("EXECUTE")).toBe(false);
});
