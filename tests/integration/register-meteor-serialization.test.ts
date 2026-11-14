import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import bs58 from "bs58";
import { expect, it } from "vitest";
import { PUBLIC_KEY } from "../../packages/domain/src/deployment-preview.js";
import {
  canonicalPolicy,
  mandatePolicy,
} from "../../packages/domain/src/index.js";
import { buildOperation } from "../../packages/domain/src/settlement.js";

const webRequire = createRequire(
  new URL("../../apps/web/package.json", import.meta.url),
);

it("round-trips the exact register_mandate shape through the pinned Meteor encoder", () => {
  const policy = mandatePolicy.parse(
      JSON.parse(
        readFileSync("tests/fixtures/m3-policy.canonical.txt", "utf8"),
      ),
    ),
    canonical = canonicalPolicy(policy),
    expectedDigest = createHash("sha256").update(canonical).digest("hex"),
    storageLimit = "100000000000000000000000",
    operation = buildOperation(
      { kind: "REGISTER", storageLimit, guardian: null },
      {
        policy,
        policyDigest: expectedDigest,
        actor: policy.ownerAccount,
        now: 1n,
      },
    ),
    sdkRoot = dirname(webRequire.resolve("@meteorwallet/sdk/package.json")),
    sdkRequire = createRequire(join(sdkRoot, "package.json")),
    sdk = webRequire("@meteorwallet/sdk"),
    { PublicKey } = sdkRequire("@near-js/crypto"),
    { Transaction } = sdkRequire("@near-js/transactions"),
    action = sdk.convertSelectorActionToNearAction({
      type: "FunctionCall",
      params: {
        methodName: operation.methodName,
        args: operation.args,
        gas: operation.gas,
        deposit: operation.deposit,
      },
    }),
    transaction = new Transaction({
      signerId: operation.signerId,
      publicKey: PublicKey.from(PUBLIC_KEY),
      nonce: 1n,
      receiverId: operation.receiverId,
      blockHash: bs58.decode("11111111111111111111111111111111"),
      actions: [action],
    });

  const encoded = transaction.encode(),
    decoded = Transaction.decode(encoded),
    call = decoded.actions[0]?.functionCall;
  expect(decoded.signerId).toBe(policy.ownerAccount);
  expect(decoded.receiverId).toBe(policy.vaultAccount);
  expect(decoded.actions).toHaveLength(1);
  expect(call?.methodName).toBe("register_mandate");
  expect(call?.gas).toBe(100000000000000n);
  expect(call?.deposit).toBe(1n);
  expect(JSON.parse(Buffer.from(call?.args ?? []).toString("utf8"))).toEqual({
    canonical_policy: canonical,
    expected_digest: expectedDigest,
    guardian: null,
    storage_limit: storageLimit,
  });
  expect(Buffer.from(decoded.encode())).toEqual(Buffer.from(encoded));
});
