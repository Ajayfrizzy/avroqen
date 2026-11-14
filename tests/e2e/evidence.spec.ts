import { createHash } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { map1For, reviewMessage } from "../../packages/domain/src/evidence.js";
import { mandatePolicy } from "../../packages/domain/src/index.js";
import { proposalInput } from "../../packages/domain/src/proposals.js";

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const policy = mandatePolicy.parse({
  schemaVersion: 1,
  policyVersion: 1,
  mandateId: uuid(1),
  organizationId: uuid(2),
  ownerAccount: "owner.testnet",
  network: "testnet",
  agentId: uuid(3),
  agentAccount: "agent.testnet",
  vaultAccount: "vault.testnet",
  recipient: "vendor.testnet",
  asset: "NativeNear",
  taskReference: "Hosting",
  maxPerPaymentAtomic: "10",
  totalBudgetAtomic: "100",
  expiresAtNs: "1893456000000000000",
  maxExecutions: 10,
  verifierPolicy: {
    version: 1,
    accounts: ["verifier.testnet"],
    threshold: 1,
    requiredClaims: ["SERVICE_CONFIRMED"],
    requireOwnerApproval: true,
  },
});
const proposal = proposalInput.parse({
  schemaVersion: 1,
  proposalId: uuid(4),
  idempotencyKey: uuid(5),
  organizationId: policy.organizationId,
  agentId: policy.agentId,
  agentAccount: policy.agentAccount,
  mandateId: policy.mandateId,
  policyVersion: 1,
  policyDigest: "a".repeat(64),
  network: "testnet",
  vaultAccount: policy.vaultAccount,
  recipient: policy.recipient,
  asset: "NativeNear",
  amountAtomic: "1",
  evidenceDigest: "b".repeat(64),
});
const metadata = {
  sourceType: "HUMAN_REVIEW",
  issuer: "Issuer",
  reference: "INV-1",
  evidenceDigest: proposal.evidenceDigest,
  mediaType: "application/pdf",
  byteLength: 100,
};
async function setup(page: Page, mode = "normal") {
  let challenges = 0,
    verifications = 0;
  const responsePolicy =
    mode === "unsafe"
      ? mandatePolicy.parse({
          ...policy,
          verifierPolicy: {
            ...policy.verifierPolicy,
            accounts: [policy.ownerAccount],
          },
        })
      : policy;
  await page.route("**/api/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const path = requestUrl.pathname;
    if (path === "/api/auth/session")
      return route.fulfill({
        json: {
          accountId: "verifier.testnet",
          network: "testnet",
          csrfToken: "synthetic-csrf",
        },
      });
    if (path === "/api/auth/config")
      return route.fulfill({
        json: { origin: requestUrl.origin, network: "testnet" },
      });
    if (mode === "denied")
      return route.fulfill({ status: 403, json: { error: "ACCESS_DENIED" } });
    if (path === "/api/verifier/proposals")
      return route.fulfill({ json: { proposals: [], nextOffset: null } });
    if (path.endsWith("/challenge")) {
      challenges++;
      const review = route.request().postDataJSON();
      const now = BigInt(Date.now() - 1000) * 1000000n;
      const payload = map1For(
        proposal,
        review,
        "verifier.testnet",
        uuid(100 + challenges),
        now,
        now + 900000000000n,
      );
      const values = {
        organizationId: policy.organizationId,
        policyDigest: proposal.policyDigest,
        evidenceId: uuid(6),
        submissionDigest: createHash("sha256")
          .update(JSON.stringify(metadata))
          .digest("hex"),
        review,
        payload,
        challengeId: uuid(200 + challenges),
        origin: requestUrl.origin,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      };
      return route.fulfill({
        json: {
          ...values,
          message: mode === "tampered" ? "changed" : reviewMessage(values),
          recipient: values.origin,
          nonce: Buffer.alloc(32, challenges).toString("base64"),
        },
      });
    }
    if (path.endsWith("/verify")) {
      verifications++;
      return route.fulfill({ status: 401, json: { error: "INVALID_PROOF" } });
    }
    return route.fulfill({
      json: {
        proposal,
        policy: responsePolicy,
        verifierPolicyStatus:
          mode === "unsafe"
            ? { eligible: false, conflict: "OWNER" }
            : { eligible: true, conflict: null },
        evidence: { id: uuid(6), metadata, status: "SUBMITTED" },
        reviews: [],
        allowedClaims:
          mode === "readonly" || mode === "unsafe"
            ? []
            : ["SERVICE_CONFIRMED", "DELIVERY_DISPUTED"],
        readiness: {
          independentVerifierPolicy: mode !== "unsafe",
          disputed: mode === "disputed",
          offchainReady: false,
          ownerApproved: false,
          ownerApprovalRequired: true,
          claims: [{ claim: "SERVICE_CONFIRMED", count: 0, required: 1 }],
          simulation: {
            enabled: mode === "simulation",
            eligibleClaims: [],
          },
        },
      },
    });
  });
  await page.goto(`/workspace/evidence?proposal=${proposal.proposalId}`);
  await page.getByRole("button", { name: "Open evidence" }).click();
  return { challenges: () => challenges, verifications: () => verifications };
}
async function review(
  page: Page,
  options: { independent?: boolean; decision?: "APPROVE" | "REJECT" } = {},
) {
  if (options.decision)
    await page.getByLabel("Decision").selectOption(options.decision);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Independently obtained document SHA-256")
    .fill(proposal.evidenceDigest);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Independently observed issuer").fill("Issuer");
  await page.getByLabel("Independently observed reference").fill("INV-1");
  await page.getByLabel("Observed recipient").fill("vendor.testnet");
  await page
    .getByLabel("Observed exact amount")
    .fill("0.000000000000000000000001");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  if (options.independent !== false) await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Review exact decision", exact: true })
    .click();
}

test("unchecked approval is blocked before challenge generation", async ({
  page,
}) => {
  const count = await setup(page);
  await review(page, { independent: false });
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "independently obtained",
  );
  await expect(
    page.getByRole("region", { name: "Review exact decision" }),
  ).toHaveCount(0);
  expect(count.challenges()).toBe(0);
});
test("unsafe historical verifier policy is read-only and visibly blocked", async ({
  page,
}) => {
  const count = await setup(page, "unsafe");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Unsafe historical verifier policy",
  );
  await expect(
    page.getByRole("button", { name: "Review exact decision", exact: true }),
  ).toHaveCount(0);
  expect(count.challenges()).toBe(0);
  expect(count.verifications()).toBe(0);
});

test("unchecked rejection remains reviewable without claiming independence", async ({
  page,
}) => {
  const count = await setup(page);
  await review(page, { independent: false, decision: "REJECT" });
  const panel = page.getByRole("region", { name: "Review exact decision" });
  await expect(panel).toContainText("Reject claim");
  await expect(panel).toContainText("offchain human decision only");
  expect(count.challenges()).toBe(0);
});

for (const width of [1280, 390])
  test(`readable human review, focus and no onchain action at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setup(page);
    await review(page);
    const panel = page.getByRole("region", { name: "Review exact decision" });
    await expect(panel).toBeFocused();
    await expect(panel).toBeInViewport();
    await expect(panel).toContainText("offchain human decision only");
    await expect(
      page.getByRole("region", { name: "Evidence requirements" }),
    ).toContainText("0 of 1");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("installed Meteor cancellation does not verify and retry creates a fresh challenge", async ({
  page,
}) => {
  const count = await setup(page);
  await review(page);
  for (let i = 1; i <= 2; i++) {
    await page
      .getByRole("button", { name: "Sign offchain review message" })
      .click();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("*")).some(
        (n) =>
          n.tagName.startsWith("METEOR-") &&
          typeof (n as HTMLElement & { closeAction?: unknown }).closeAction ===
            "function",
      ),
    );
    await page.evaluate(() => {
      const n = Array.from(document.querySelectorAll("*")).find(
        (n) =>
          n.tagName.startsWith("METEOR-") &&
          typeof (n as HTMLElement & { closeAction?: unknown }).closeAction ===
            "function",
      );
      (n as HTMLElement & { closeAction: () => void }).closeAction();
    });
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "Review signing canceled",
    );
    expect(count.verifications()).toBe(0);
    expect(count.challenges()).toBe(i);
  }
});
test("tampered challenge never reaches verification", async ({ page }) => {
  const c = await setup(page, "tampered");
  await review(page);
  await page
    .getByRole("button", { name: "Sign offchain review message" })
    .click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "does not match",
  );
  expect(c.verifications()).toBe(0);
});
test("unauthorized evidence is not rendered", async ({ page }) => {
  await setup(page, "denied");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "cannot access",
  );
  await expect(
    page.getByRole("region", { name: "Evidence requirements" }),
  ).toHaveCount(0);
});
test("read-only member cannot initiate a verifier review", async ({ page }) => {
  await setup(page, "readonly");
  await expect(
    page.getByRole("button", { name: "Review exact decision", exact: true }),
  ).toHaveCount(0);
});
test("Testnet simulation is explicit and does not claim commercial verification", async ({
  page,
}) => {
  await setup(page, "simulation");
  await expect(
    page.getByText("Testnet simulation is enabled", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("How you obtained evidence")).toContainText(
    "Fictional invoice — Testnet simulation only",
  );
});
test("dispute dominates readiness and removes review controls", async ({
  page,
}) => {
  await setup(page, "disputed");
  await expect(
    page.getByText("Delivery disputed. Further", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review exact decision", exact: true }),
  ).toHaveCount(0);
});
test("file hashing stays in browser and rejects unsupported types", async ({
  page,
}) => {
  await setup(page);
  let posts = 0;
  page.on("request", (r) => {
    if (r.method() === "POST") posts++;
  });
  const bytes = Buffer.from("synthetic exercise\n");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Optional: hash a local document", { exact: false })
    .setInputFiles({
      name: "sample.txt",
      mimeType: "text/plain",
      buffer: bytes,
    });
  await expect(
    page.getByLabel("Independently obtained document SHA-256"),
  ).toHaveValue(createHash("sha256").update(bytes).digest("hex"));
  await page
    .getByLabel("Optional: hash a local document", { exact: false })
    .setInputFiles({
      name: "sample.html",
      mimeType: "text/html",
      buffer: bytes,
    });
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Unsupported file type",
  );
  expect(posts).toBe(0);
});
