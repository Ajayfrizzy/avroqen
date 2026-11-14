import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { map1For, reviewInput } from "../../packages/domain/src/evidence.js";
import {
  canonicalPolicy,
  mandatePolicy,
} from "../../packages/domain/src/index.js";
import { proposalInput } from "../../packages/domain/src/proposals.js";
import { buildOperation } from "../../packages/domain/src/settlement.js";

const policy = mandatePolicy.parse({
  ...JSON.parse(readFileSync("tests/fixtures/m3-policy.canonical.txt", "utf8")),
  maxPerPaymentAtomic: "100000000000000000000000",
  totalBudgetAtomic: "1000000000000000000000000",
});
const proposal = proposalInput.parse({
  schemaVersion: 1,
  proposalId: "44444444-4444-4444-8444-444444444444",
  idempotencyKey: "55555555-5555-4555-8555-555555555555",
  organizationId: policy.organizationId,
  agentId: policy.agentId,
  agentAccount: policy.agentAccount,
  mandateId: policy.mandateId,
  policyVersion: policy.policyVersion,
  policyDigest: createHash("sha256")
    .update(canonicalPolicy(policy))
    .digest("hex"),
  network: "testnet",
  vaultAccount: policy.vaultAccount,
  recipient: policy.recipient,
  asset: "NativeNear",
  amountAtomic: "100000000000000000000000",
  evidenceDigest: "b".repeat(64),
});
const reviewId = "66666666-6666-4666-8666-666666666666";
const fixtureNow = BigInt(Date.now()) * 1_000_000n;
const review = reviewInput.parse({
  claim: "INVOICE_ISSUED",
  decision: "APPROVE",
  observation: {
    source: "LOCAL_EXERCISE",
    issuer: "Fictional supplier",
    reference: "SIM-AT6",
    observedAtNs: (fixtureNow - 1_000_000_000n).toString(),
    event: "INVOICE_ISSUED",
    recipient: proposal.recipient,
    amountAtomic: proposal.amountAtomic,
    evidenceDigest: proposal.evidenceDigest,
    independentlyObtained: true,
  },
});
const payload = map1For(
  proposal,
  review,
  "verifier.testnet",
  "77777777-7777-4777-8777-777777777777",
  fixtureNow,
  fixtureNow + 60n * 60n * 1_000_000_000n,
);

test("Payments selects and exactly prepares an eligible simulated invoice attestation", async ({
  page,
}) => {
  let prepared = false,
    beginCalls = 0;
  const operation = buildOperation(
    { kind: "ATTEST", reviewId },
    {
      policy,
      policyDigest: proposal.policyDigest,
      actor: "verifier.testnet",
      now: fixtureNow + 1_000_000n,
      proposal,
      evidence: payload,
    },
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/session"))
      return route.fulfill({
        json: { accountId: "verifier.testnet", csrfToken: "fixture" },
      });
    if (path.endsWith("/assignments"))
      return route.fulfill({ json: { mandates: [policy] } });
    if (path.endsWith("/status"))
      return route.fulfill({
        json: {
          status: "VERIFIED",
          deploymentVerified: true,
          submissionEnabled: true,
        },
      });
    if (request.method() === "POST" && path.endsWith("/intents")) {
      expect(request.postDataJSON()).toMatchObject({
        operation: { kind: "ATTEST", reviewId },
      });
      prepared = true;
      return route.fulfill({
        status: 201,
        json: {
          id: "88888888-8888-4888-8888-888888888888",
          state: "PREPARED",
          operation,
        },
      });
    }
    if (path.endsWith("/begin")) {
      beginCalls++;
      return route.fulfill({ json: { state: "AWAITING_WALLET" } });
    }
    return route.fulfill({
      json: {
        policy,
        onchain: null,
        block: null,
        proposals: [proposal],
        reviews: [
          {
            id: reviewId,
            payload,
            simulation: {
              eligible: true,
              provenance: "LOCAL_EXERCISE_SYNTHETIC_ONLY",
            },
          },
        ],
        intents: [],
      },
    });
  });

  await page.goto(`/workspace/settlement?mandate=${policy.mandateId}`);
  await page.getByLabel("Operation").selectOption("ATTEST");
  const selector = page.getByLabel("Your signed review");
  await expect(selector).toContainText("Simulated Testnet invoice");
  await expect(selector).toHaveValue(reviewId);
  await page.getByRole("button", { name: "Prepare exact operation" }).click();
  await expect.poll(() => prepared).toBe(true);
  const exact = page.getByRole("region", { name: "Exact transaction review" });
  await expect(exact).toContainText("attest_proposal");
  await expect(exact).toContainText("verifier.testnet");
  await expect(exact).toContainText("vault.testnet");
  await expect(exact).toContainText(payload.nonce);
  const authorize = exact.getByRole("button", {
    name: "Open wallet and authorize",
  });
  await expect(authorize).toBeEnabled();
  await authorize.click();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("*")).some(
      (node) =>
        node.tagName.startsWith("METEOR-") &&
        typeof (node as HTMLElement & { closeAction?: unknown }).closeAction ===
          "function",
    ),
  );
  await page.evaluate(() => {
    const node = Array.from(document.querySelectorAll("*")).find(
      (candidate) =>
        candidate.tagName.startsWith("METEOR-") &&
        typeof (candidate as HTMLElement & { closeAction?: unknown })
          .closeAction === "function",
    );
    (node as HTMLElement & { closeAction: () => void }).closeAction();
  });
  await expect.poll(() => beginCalls).toBe(0);
  await expect(page.locator("main")).not.toContainText(
    "Transaction binding mismatch",
  );
});
