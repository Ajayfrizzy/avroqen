import { createHash } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import {
  canonicalPolicy,
  consentMessage,
  type MandateView,
  mandatePolicy,
} from "../../packages/domain/src/index.js";

const org = "00000000-0000-4000-8000-000000000001",
  agent = "00000000-0000-4000-8000-000000000002";
const policy = mandatePolicy.parse({
  schemaVersion: 1,
  policyVersion: 1,
  mandateId: "00000000-0000-4000-8000-000000000003",
  organizationId: org,
  ownerAccount: "alice.testnet",
  network: "testnet",
  agentId: agent,
  agentAccount: "agent.testnet",
  vaultAccount: "vault.testnet",
  recipient: "vendor.testnet",
  asset: "NativeNear",
  taskReference: "Hosting",
  maxPerPaymentAtomic: "1000000000000000000000001",
  totalBudgetAtomic: "3000000000000000000000000",
  expiresAtNs: "1893456000000000000",
  maxExecutions: 3,
  verifierPolicy: {
    version: 1,
    accounts: ["verifier.testnet"],
    threshold: 1,
    requiredClaims: ["SERVICE_CONFIRMED"],
    requireOwnerApproval: true,
  },
});
function record(): MandateView {
  return {
    policy,
    policyDigest: createHash("sha256")
      .update(canonicalPolicy(policy))
      .digest("hex"),
    consentStatus: "DRAFT",
    onchainStatus: "NOT_SUBMITTED",
    expired: false,
    agentDisabled: false,
  };
}
async function setup(
  page: Page,
  options: {
    empty?: boolean;
    role?: string;
    denied?: boolean;
    value?: MandateView;
  } = {},
) {
  let rows = options.empty ? [] : [options.value ?? record()];
  let verifications = 0,
    challenges = 0;
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path === "/api/auth/session")
      return route.fulfill({
        json: {
          accountId: "alice.testnet",
          network: "testnet",
          expiresAt: new Date(Date.now() + 900000).toISOString(),
          csrfToken: "synthetic-csrf",
        },
      });
    if (path === "/api/auth/config")
      return route.fulfill({
        json: { origin: "http://127.0.0.1:3000", network: "testnet" },
      });
    if (path === "/api/organizations")
      return route.fulfill({
        json: {
          organizations: [
            { id: org, name: "Research", role: options.role ?? "owner" },
          ],
          nextOffset: null,
        },
      });
    if (options.denied)
      return route.fulfill({ status: 403, json: { error: "ACCESS_DENIED" } });
    if (path.endsWith("/agents"))
      return route.fulfill({
        json: {
          agents: [
            {
              id: agent,
              name: "Proposer",
              accountId: "agent.testnet",
              disabledAt: null,
            },
          ],
          nextOffset: null,
        },
      });
    if (request.method() === "POST")
      expect(request.headers()["x-csrf-token"]).toBe("synthetic-csrf");
    if (path.endsWith("/mandates")) {
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        expect(body.maxPerPaymentAtomic).toBe("1000000000000000000000001");
        expect(body.ownerAccount).toBeUndefined();
        rows = [record()];
        return route.fulfill({ status: 201, json: rows[0] });
      }
      return route.fulfill({ json: { mandates: rows, nextOffset: null } });
    }
    if (path.endsWith("/challenge")) {
      challenges++;
      const action = request.postDataJSON().action;
      const challengeId = `00000000-0000-4000-8000-${String(challenges).padStart(12, "0")}`,
        expiresAt = new Date(Date.now() + 300000).toISOString();
      return route.fulfill({
        json: {
          challengeId,
          expiresAt,
          nonce: Buffer.alloc(32, challenges).toString("base64"),
          recipient: "http://127.0.0.1:3000",
          message: consentMessage({
            action,
            policy,
            policyDigest: record().policyDigest,
            challengeId,
            origin: "http://127.0.0.1:3000",
            expiresAt,
          }),
        },
      });
    }
    if (path.endsWith("/verify")) {
      verifications++;
      return route.fulfill({ status: 401, json: { error: "INVALID_PROOF" } });
    }
    return route.fulfill({ json: rows[0] });
  });
  await page.goto(`/workspace/mandates?organization=${org}`);
  return { verifications: () => verifications, challenges: () => challenges };
}
test("mobile draft and exact review clearly distinguish offchain consent", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, { empty: true });
  await expect(
    page.getByText("No mandates yet.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create a draft" }).click();
  for (const [id, value] of Object.entries({
    task: "Hosting",
    vault: "vault.testnet",
    recipient: "vendor.testnet",
  }))
    await page.locator(`#${id}`).fill(value);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  for (const [id, value] of Object.entries({
    per: "1.000000000000000000000001",
    total: "3",
    executions: "3",
    expiry: "2030-01-01T00:00",
  }))
    await page.locator(`#${id}`).fill(value);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("#agent").selectOption(agent);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.locator("#verifiers").fill("verifier.testnet");
  await page.locator("#threshold").fill("1");
  await page.getByLabel("Service confirmed", { exact: true }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save draft & review" }).click();
  const review = page.getByRole("region", { name: "Policy review" });
  await review
    .getByText("Immutable policy identifiers and exact signed terms")
    .click();
  await expect(review).toContainText("1000000000000000000000001 yoctoNEAR");
  await expect(review).toContainText("consent is not vault authorization");
  await expect(review).toContainText("unverified by this consent flow");
  await expect(
    page.getByRole("button", { name: "Sign offchain approval" }),
  ).toBeDisabled();
  await page.getByLabel("I reviewed the exact terms", { exact: false }).check();
  await expect(
    page.getByRole("button", { name: "Sign offchain approval" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("installed wallet dialog cancellation creates no consent and retry gets new challenge", async ({
  page,
}) => {
  const counts = await setup(page);
  await page.getByRole("button", { name: "Review exact terms" }).click();
  await page.getByLabel("I reviewed the exact terms", { exact: false }).check();
  // Use installed SDK dialog cancellation, not a simulated wallet signature.
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.getByRole("button", { name: "Sign offchain approval" }).click();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("*")).some(
        (node) =>
          node.tagName.startsWith("METEOR-") &&
          typeof (node as HTMLElement & { closeAction?: unknown })
            .closeAction === "function",
      ),
    );
    await page.evaluate(() => {
      const node = Array.from(document.querySelectorAll("*")).find(
        (node) =>
          node.tagName.startsWith("METEOR-") &&
          typeof (node as HTMLElement & { closeAction?: unknown })
            .closeAction === "function",
      );
      (node as HTMLElement & { closeAction: () => void }).closeAction();
    });
    await expect(
      page.getByText("Wallet consent canceled.", { exact: false }),
    ).toBeVisible();
    expect(counts.verifications()).toBe(0);
    expect(counts.challenges()).toBe(attempt);
  }
});
test("revocation review warns it cannot revoke onchain state", async ({
  page,
}) => {
  await setup(page, {
    value: { ...record(), consentStatus: "CONSENT_APPROVED_OFFCHAIN" },
  });
  await page.getByRole("button", { name: "Request revocation" }).click();
  await expect(
    page.getByRole("heading", { name: "Revoke offchain consent" }),
  ).toBeVisible();
  await expect(
    page.getByText("It does not revoke an onchain mandate", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign offchain revocation" }),
  ).toBeDisabled();
});
test("viewer cannot create or sign and unauthorized errors stay sanitized", async ({
  page,
}) => {
  await setup(page, { role: "viewer" });
  await expect(
    page.getByText("Read-only access.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create a draft" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Review exact terms" }).click();
  await expect(
    page.getByRole("button", { name: "Sign offchain approval" }),
  ).toHaveCount(0);
});
test("revoked and expired records never offer new approval", async ({
  page,
}) => {
  await setup(page, {
    value: {
      ...record(),
      consentStatus: "CONSENT_REVOKED_OFFCHAIN",
      expired: true,
    },
  });
  await page.getByRole("button", { name: "Review exact terms" }).click();
  await expect(
    page.getByRole("region", { name: "Policy review" }),
  ).toContainText("Consent revoked — offchain only");
  await expect(
    page.getByRole("button", { name: "Sign offchain approval" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Request revocation" }),
  ).toHaveCount(0);
});
test("server denies organization access without exposing privileged controls", async ({
  page,
}) => {
  await setup(page, { denied: true });
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Access denied",
  );
  await expect(
    page.getByRole("button", { name: "Sign offchain approval" }),
  ).toHaveCount(0);
});
test("altered server challenge is not sent to the wallet", async ({ page }) => {
  const counts = await setup(page);
  await page.route("**/mandates/*/challenge", (route) =>
    route.fulfill({
      json: {
        challengeId: "00000000-0000-4000-8000-000000000099",
        recipient: "http://127.0.0.1:3000",
        nonce: Buffer.alloc(32).toString("base64"),
        message: "Altered recipient or budget",
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      },
    }),
  );
  await page.getByRole("button", { name: "Review exact terms" }).click();
  await page.getByLabel("I reviewed the exact terms", { exact: false }).check();
  await page.getByRole("button", { name: "Sign offchain approval" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "operation was not completed",
  );
  expect(counts.verifications()).toBe(0);
  expect(
    await page.evaluate(() =>
      Array.from(document.querySelectorAll("*")).some((n) =>
        n.tagName.startsWith("METEOR-"),
      ),
    ),
  ).toBe(false);
});

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`mandate actions reveal and focus their section on mobile: ${reducedMotion}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion });
    await setup(page);
    const create = page.getByRole("button", { name: "Create a draft" });
    await create.focus();
    await page.keyboard.press("Enter");
    const draft = page.getByRole("heading", { name: "Create immutable draft" });
    await expect(draft).toBeFocused();
    expect((await draft.boundingBox())?.y).toBeLessThan(200);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.getByRole("button", { name: "Create a draft" }).click();
    await expect(draft).toBeVisible();
    await expect(draft).toBeFocused();
    await page.getByRole("button", { name: "Review exact terms" }).click();
    const review = page.getByRole("heading", {
      name: "Review mandate consent",
    });
    await expect(review).toBeFocused();
    expect((await review.boundingBox())?.y).toBeLessThan(500);
    await expect(draft).toHaveCount(0);
    await page.getByRole("button", { name: "Request revocation" }).click();
    const revoke = page.getByRole("heading", {
      name: "Revoke offchain consent",
    });
    await expect(revoke).toBeFocused();
    expect((await revoke.boundingBox())?.y).toBeLessThan(500);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
test("review loading disables duplicate actions and handles failure without opening stale review", async ({
  page,
}) => {
  await setup(page);
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let count = 0;
  await page.route(`**/mandates/${policy.mandateId}`, async (route) => {
    count++;
    await gate;
    await route.fulfill({
      status: 503,
      json: { error: "SERVICE_UNAVAILABLE" },
    });
  });
  const button = page.getByRole("button", { name: "Review exact terms" });
  await button.click();
  await expect(button).toBeDisabled();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "Request in progress",
  );
  release();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(button).toBeEnabled();
  expect(count).toBe(1);
  await expect(page.getByRole("region", { name: "Policy review" })).toHaveCount(
    0,
  );
});

test("M3 boundary stays unavailable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await setup(page);
  await page.goto("/workspace/mandates");
  await expect(
    page.getByText("Consent here is offchain only.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("No funds move here", { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Funded balance: 0", { exact: false }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
