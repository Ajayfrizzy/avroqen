import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const policy = JSON.parse(
  readFileSync("tests/fixtures/m3-policy.canonical.txt", "utf8"),
);
const unresolved = {
  id: "fc90a45b-5a0d-42bb-a73b-e4c1bec9ef84",
  state: "UNKNOWN",
  reason: "HASH_NOT_RECOVERED",
  wallet_outcome: "WALLET_OUTCOME_UNKNOWN",
  replacement_authorized_at: null,
  controlled_replacement_of: null,
  operation: {
    network: "testnet",
    signerId: policy.ownerAccount,
    receiverId: policy.vaultAccount,
    methodName: "storage_deposit",
    args: {},
    gas: "100000000000000",
    deposit: "100000000000000000000000",
    mandateId: policy.mandateId,
    policyDigest: "a".repeat(64),
    kind: "STORAGE_DEPOSIT",
  },
  explorerUrl: null,
};

async function commonRoutes(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      json: { accountId: policy.ownerAccount, csrfToken: "fixture" },
    }),
  );
  await page.route("**/api/chain/assignments", (route) =>
    route.fulfill({ json: { mandates: [policy] } }),
  );
  await page.route("**/api/organizations/**/mandates/**/chain", (route) =>
    route.fulfill({
      json: {
        policy,
        onchain: null,
        block: null,
        proposals: [],
        reviews: [],
        intents: [unresolved],
      },
    }),
  );
}

test("Payments polling never overlaps a slow refresh", async ({ page }) => {
  await page.clock.install();
  await commonRoutes(page);
  let calls = 0;
  let active = 0;
  let maximum = 0;
  let release: (() => void) | undefined;
  await page.route("**/api/chain/status", async (route) => {
    calls++;
    if (calls > 1) {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      active--;
    }
    await route.fulfill({
      json: {
        status: "VERIFIED",
        deploymentVerified: true,
        submissionEnabled: true,
      },
    });
  });
  await page.goto(`/workspace/settlement?mandate=${policy.mandateId}`);
  await expect(page.getByText("Operation history")).toBeVisible();
  await page.clock.fastForward(16_001);
  await expect.poll(() => active).toBe(1);
  await page.clock.fastForward(65_000);
  expect(maximum).toBe(1);
  expect(calls).toBe(2);
  release?.();
  await expect.poll(() => active).toBe(0);
});

test("Payments polling backs off after an unavailable response", async ({
  page,
}) => {
  await page.clock.install();
  await commonRoutes(page);
  let calls = 0;
  await page.route("**/api/chain/status", (route) => {
    calls++;
    if (calls === 2)
      return route.fulfill({ status: 503, json: { error: "RPC_UNAVAILABLE" } });
    return route.fulfill({
      json: {
        status: "VERIFIED",
        deploymentVerified: true,
        submissionEnabled: true,
      },
    });
  });
  await page.goto(`/workspace/settlement?mandate=${policy.mandateId}`);
  await expect(page.getByText("Operation history")).toBeVisible();
  await page.clock.fastForward(16_001);
  await expect.poll(() => calls).toBe(2);
  await page.clock.fastForward(29_000);
  expect(calls).toBe(2);
  await page.clock.fastForward(2_001);
  await expect.poll(() => calls).toBe(3);
});
