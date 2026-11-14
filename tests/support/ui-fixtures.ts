import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { MandateView } from "../../packages/domain/src/index";
export const policy = {
  ...JSON.parse(readFileSync("tests/fixtures/m3-policy.canonical.txt", "utf8")),
  taskReference: "Cloud infrastructure",
  maxPerPaymentAtomic: "250000000000000000000000",
  totalBudgetAtomic: "1500000000000000000000000",
};
export const orgId = policy.organizationId;
export const proposalId = "44444444-4444-4444-8444-444444444444";
const verifierPolicyStatus = { eligible: true, conflict: null } as const;
export const mandate = {
  policy,
  policyDigest: "a".repeat(64),
  consentStatus: "CONSENT_APPROVED_OFFCHAIN",
  expired: false,
  agentDisabled: false,
  onchainStatus: "NOT_SUBMITTED",
  verifierPolicyStatus,
} satisfies MandateView;
const proposal = {
  schemaVersion: 1,
  proposalId,
  idempotencyKey: "55555555-5555-4555-8555-555555555555",
  mandateId: policy.mandateId,
  organizationId: orgId,
  agentId: policy.agentId,
  agentAccount: policy.agentAccount,
  policyVersion: 1,
  policyDigest: "a".repeat(64),
  network: "testnet",
  vaultAccount: policy.vaultAccount,
  recipient: policy.recipient,
  asset: "NativeNear",
  amountAtomic: "100000000000000000000000",
  evidenceDigest: "b".repeat(64),
};
const alert = {
  id: "66666666-6666-4666-8666-666666666666",
  rule: "UNRESOLVED_OUTCOME",
  severity: "HIGH",
  classification: "OPERATIONAL_WARNING",
  explanation:
    "An operation is awaiting independent receipt verification. Keep its reservation protected while reconciliation continues.",
  mandate_id: policy.mandateId,
  subject: policy.agentAccount,
  state: "OPEN",
  version: 1,
  occurrences: 2,
  first_observed: "2026-11-03T09:00:00Z",
  last_observed: "2026-11-03T09:10:00Z",
  assigned_account: null,
};
export type Mode = "populated" | "empty" | "error" | "signed-out" | "loading";
export async function uiFixture(page: Page, mode: Mode = "populated") {
  let release = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/config"))
      return route.fulfill({
        json: {
          network: "testnet",
          origin: "http://127.0.0.1:3000",
          connector: "meteor",
        },
      });
    if (path.endsWith("/session")) {
      if (mode === "loading") await gate;
      if (mode === "signed-out")
        return route.fulfill({ status: 401, json: { error: "AUTH_REQUIRED" } });
      if (mode === "error") return route.abort();
      return route.fulfill({
        json: {
          accountId: policy.ownerAccount,
          network: "testnet",
          csrfToken: "synthetic-ui-fixture",
          expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        },
      });
    }
    if (path === "/api/organizations")
      return route.fulfill({
        json: {
          organizations: [
            { id: orgId, name: "Northstar Studio", role: "owner" },
          ],
          nextOffset: null,
        },
      });
    if (path === "/api/agent/assignments")
      return route.fulfill({
        json: { assignments: [], nextOffset: null },
      });
    if (path.endsWith("/assignments"))
      return route.fulfill({
        json: { mandates: mode === "empty" ? [] : [policy] },
      });
    if (path.endsWith("/agents"))
      return route.fulfill({
        json: {
          agents:
            mode === "empty"
              ? []
              : [
                  {
                    id: policy.agentId,
                    name: "Infrastructure assistant",
                    accountId: policy.agentAccount,
                    disabledAt: null,
                  },
                ],
          nextOffset: null,
        },
      });
    if (path.endsWith("/mandates"))
      return route.fulfill({
        json: { mandates: mode === "empty" ? [] : [mandate], nextOffset: null },
      });
    if (path.endsWith(policy.mandateId))
      return route.fulfill({ json: mandate });
    if (path.endsWith("/proposals"))
      return route.fulfill({
        json: {
          proposals:
            mode === "empty"
              ? []
              : [{ proposal, status: "SUBMITTED_OFFCHAIN" }],
          nextOffset: null,
        },
      });
    if (path.includes("/evidence/"))
      return route.fulfill({
        json: {
          policy,
          proposal,
          verifierPolicyStatus,
          evidence: {
            id: "77777777-7777-4777-8777-777777777777",
            metadata: {
              issuer: "Example hosting provider",
              reference: "EXAMPLE-INV-0042",
              mediaType: "application/pdf",
              byteLength: 4096,
            },
            status: "SUBMITTED",
          },
          reviews: [],
          allowedClaims: ["SERVICE_CONFIRMED", "OWNER_APPROVED"],
          readiness: {
            independentVerifierPolicy: true,
            offchainReady: false,
            ownerApproved: false,
            ownerApprovalRequired: true,
            disputed: false,
            claims: [{ claim: "SERVICE_CONFIRMED", count: 0, required: 1 }],
            simulation: { enabled: false, eligibleClaims: [] },
          },
        },
      });
    if (path === "/api/verifier/proposals")
      return route.fulfill({ json: { proposals: [], nextOffset: null } });
    if (path.endsWith("/security"))
      return route.fulfill({
        json: {
          alerts: mode === "empty" ? [] : [alert],
          counts: mode === "empty" ? [] : [{ severity: "HIGH", count: 1 }],
          settlements: [{ state: "UNKNOWN", count: 1 }],
          health: [
            { worker: "reconciliation", healthy: true },
            { worker: "monitoring", healthy: true },
          ],
          canRespond: true,
          nextOffset: null,
        },
      });
    if (path.includes("/security/"))
      return route.fulfill({
        json: {
          alert,
          ownerActions: true,
          history: [
            {
              action: "DETECTED",
              version: 1,
              actor_account: null,
              occurred_at: "2026-11-03T09:00:00Z",
            },
          ],
          evidence: [],
          nextOffset: null,
        },
      });
    if (path.endsWith("/credentials"))
      return route.fulfill({ json: { credentials: [], nextOffset: null } });
    if (path.endsWith("/status"))
      return route.fulfill({
        json: { status: "NOT_AUTHORIZED", submissionEnabled: false },
      });
    if (path.endsWith("/chain"))
      return route.fulfill({
        json: {
          policy,
          onchain: null,
          block: null,
          proposals: [proposal],
          onchainProposals: {},
          reviews: [],
          intents: [
            {
              id: "88888888-8888-4888-8888-888888888888",
              state: "UNKNOWN",
              reason: "RPC_OR_EVIDENCE_UNAVAILABLE",
              operation: {
                kind: "EXECUTE",
                methodName: "authorize_and_execute",
                signerId: policy.ownerAccount,
              },
              explorerUrl: null,
            },
          ],
        },
      });
    return route.fulfill({ status: 403, json: { error: "ACCESS_DENIED" } });
  });
  return release;
}
export const routes = [
  "wallet",
  "overview",
  "mandates",
  "proposals",
  "verification",
  "payments",
  "security",
] as const;
export type Screen = (typeof routes)[number];
export async function openScreen(
  page: Page,
  screen: Screen,
  mode: Mode = "populated",
) {
  const paths = {
    wallet: "",
    overview: "/journey",
    mandates: "/mandates",
    proposals: "/proposals",
    verification: "/evidence",
    payments: "/settlement",
    security: "/security",
  };
  await page.goto(`/workspace${paths[screen]}`);
  if (mode === "signed-out" || mode === "error" || mode === "loading") return;
  if (screen === "wallet")
    await page
      .getByRole("combobox", { name: "Select organization", exact: true })
      .selectOption(orgId);
  if (screen === "mandates")
    await page.getByLabel("Organization", { exact: true }).selectOption(orgId);
  if (screen === "proposals") {
    await page.getByRole("tab", { name: "Organization mandates" }).click();
    await page.getByLabel("Organization", { exact: true }).selectOption(orgId);
  }
  if (screen === "security")
    await page
      .getByRole("combobox", { name: "Select organization", exact: true })
      .selectOption(orgId);
  if (mode === "empty") return;
  if (screen === "overview")
    await page.getByLabel("Journey mandate").selectOption(policy.mandateId);
  if (screen === "proposals") {
    await page
      .getByRole("combobox", { name: "Mandate", exact: true })
      .selectOption(policy.mandateId);
    await page.getByRole("button", { name: "Load proposal history" }).click();
  }
  if (screen === "payments")
    await page
      .getByRole("combobox", { name: "Mandate", exact: true })
      .selectOption(policy.mandateId);
  if (screen === "verification") {
    await page.getByLabel("Proposal ID", { exact: true }).fill(proposalId);
    await page.getByRole("button", { name: "Open evidence" }).click();
  }
}
