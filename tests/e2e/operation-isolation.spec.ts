import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  canonicalPolicy,
  mandatePolicy,
} from "../../packages/domain/src/index.js";
import { buildOperation } from "../../packages/domain/src/settlement.js";

const first = mandatePolicy.parse(
  JSON.parse(readFileSync("tests/fixtures/m3-policy.canonical.txt", "utf8")),
);
const second = mandatePolicy.parse({
  ...first,
  mandateId: "77777777-7777-4777-8777-777777777777",
  taskReference: "Independent registration",
});
const unknown = {
  id: "f19a3732-f9ff-4374-9f46-1e54596f3440",
  state: "UNKNOWN",
  reason: "HASH_NOT_RECOVERED",
  wallet_outcome: "WALLET_OUTCOME_UNKNOWN",
  replacement_authorized_at: null,
  controlled_replacement_of: null,
  operation: {
    network: "testnet",
    signerId: first.ownerAccount,
    receiverId: first.vaultAccount,
    methodName: "register_mandate",
    args: {},
    gas: "100000000000000",
    deposit: "1",
    mandateId: first.mandateId,
    policyDigest: "a".repeat(64),
    kind: "REGISTER",
  },
  explorerUrl: null,
};

test("an unrelated UNKNOWN registration does not disable a newly approved mandate", async ({
  page,
}) => {
  let prepared = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/session"))
      return route.fulfill({
        json: { accountId: first.ownerAccount, csrfToken: "fixture" },
      });
    if (path.endsWith("/assignments"))
      return route.fulfill({ json: { mandates: [first, second] } });
    if (path.endsWith("/status"))
      return route.fulfill({
        json: {
          status: "VERIFIED",
          deploymentVerified: true,
          submissionEnabled: true,
        },
      });
    if (
      request.method() === "POST" &&
      path.includes(second.mandateId) &&
      path.endsWith("/chain/intents")
    ) {
      const input = request.postDataJSON().operation;
      const digest = createHash("sha256")
        .update(canonicalPolicy(second))
        .digest("hex");
      const operation = buildOperation(input, {
        policy: second,
        policyDigest: digest,
        actor: first.ownerAccount,
        now: 1n,
      });
      prepared = true;
      return route.fulfill({
        status: 201,
        json: {
          id: "88888888-8888-4888-8888-888888888888",
          operation,
          state: "PREPARED",
        },
      });
    }
    const selected = path.includes(second.mandateId) ? second : first;
    return route.fulfill({
      json: {
        policy: selected,
        onchain: null,
        block: null,
        proposals: [],
        reviews: [],
        intents: selected === first ? [unknown] : [],
      },
    });
  });

  await page.goto(`/workspace/settlement?mandate=${first.mandateId}`);
  await expect(
    page.getByText(
      "Do not repeat this operation while its outcome is unresolved.",
    ),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Mandate", exact: true })
    .selectOption(second.mandateId);
  const prepare = page.getByRole("button", { name: "Prepare exact operation" });
  await expect(prepare).toBeEnabled();
  await page.getByLabel("Storage spending ceiling (NEAR)").fill("0.1");
  await prepare.click();
  await expect.poll(() => prepared).toBe(true);
  await expect(
    page.getByText(
      "Prepared only. Review the exact operation before opening your wallet.",
    ),
  ).toBeVisible();
});
