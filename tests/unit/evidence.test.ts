import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  allowedReviewer,
  assessment,
  attestationIntent,
  evidenceInput,
  map1For,
  type ReviewRecord,
  readiness,
  reviewInput,
  reviewMessage,
  validateMap1,
} from "../../packages/domain/src/evidence.js";
import { mandatePolicy } from "../../packages/domain/src/index.js";
import { proposalInput } from "../../packages/domain/src/proposals.js";

const policy = mandatePolicy.parse({
  schemaVersion: 1,
  policyVersion: 1,
  mandateId: randomUUID(),
  organizationId: randomUUID(),
  ownerAccount: "owner.testnet",
  network: "testnet",
  agentId: randomUUID(),
  agentAccount: "agent.testnet",
  vaultAccount: "vault.testnet",
  recipient: "vendor.testnet",
  asset: "NativeNear",
  taskReference: "Service",
  maxPerPaymentAtomic: "10",
  totalBudgetAtomic: "100",
  expiresAtNs: "1000000000000000",
  maxExecutions: 10,
  verifierPolicy: {
    version: 1,
    accounts: ["v1.testnet", "v2.testnet"],
    threshold: 2,
    requiredClaims: ["INVOICE_ISSUED", "SERVICE_CONFIRMED"],
    requireOwnerApproval: true,
  },
});
const proposal = proposalInput.parse({
  schemaVersion: 1,
  proposalId: randomUUID(),
  idempotencyKey: randomUUID(),
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
const review = reviewInput.parse({
  claim: "SERVICE_CONFIRMED",
  decision: "APPROVE",
  observation: {
    source: "AUTHENTICATED_PROVIDER_PORTAL",
    issuer: "Issuer",
    reference: "INV-1",
    observedAtNs: "100",
    event: "SERVICE_ACTIVATED",
    recipient: proposal.recipient,
    amountAtomic: "1",
    evidenceDigest: proposal.evidenceDigest,
    independentlyObtained: true,
  },
});
const proof = map1For(
  proposal,
  review,
  "v1.testnet",
  randomUUID(),
  100n,
  1000n,
);
it("renders the exact review and MAP-1 payload as ASCII-stable signing bytes", () => {
  const values = {
    organizationId: policy.organizationId,
    policyDigest: proposal.policyDigest,
    evidenceId: "00000000-0000-4000-8000-000000000001",
    submissionDigest: "c".repeat(64),
    review,
    payload: proof,
    challengeId: "00000000-0000-4000-8000-000000000002",
    origin: "https://app.example.test",
    expiresAt: "2030-01-01T00:00:00.000Z",
  };
  const message = reviewMessage(values);
  expect(message).toContain("Avroqen M5 human review v2 - OFFCHAIN ONLY.");
  expect(message).not.toContain("\u2014");
  expect(Buffer.byteLength(message)).toBe(message.length);
  expect(JSON.parse(message.slice(message.lastIndexOf("\n") + 1))).toEqual(
    values,
  );
});
it.each([
  "network_id",
  "vault_account",
  "mandate_id",
  "policy_version",
  "proposal_id",
  "asset_id",
  "recipient",
  "amount_atomic",
  "claim_type",
  "evidence_digest",
  "verifier_account",
])("rejects MAP-1 substitution %s", (field) => {
  const values: Record<string, unknown> = {
    network_id: "mainnet",
    vault_account: "evil.testnet",
    mandate_id: randomUUID(),
    policy_version: 2,
    proposal_id: randomUUID(),
    asset_id: "Other",
    recipient: "evil.testnet",
    amount_atomic: "2",
    claim_type: "OWNER_APPROVED",
    evidence_digest: "c".repeat(64),
    verifier_account: "evil.testnet",
  };
  let accepted = false;
  try {
    accepted = validateMap1(
      { ...proof, [field]: values[field] },
      proposal,
      policy,
      200n,
    );
  } catch {}
  expect(accepted).toBe(false);
});
it("expiry and future issuance fail exact bigint comparison", () => {
  expect(validateMap1(proof, proposal, policy, 1000n)).toBe(false);
  expect(validateMap1(proof, proposal, policy, 99n)).toBe(false);
  expect(validateMap1(proof, proposal, policy, 200n)).toBe(true);
});
it("per-claim distinct quorum and owner approval cannot substitute for one another", () => {
  const rows: ReviewRecord[] = [];
  for (const claim of policy.verifierPolicy.requiredClaims)
    for (const account of policy.verifierPolicy.accounts) {
      rows.push({
        review: { ...review, claim },
        payload: map1For(
          proposal,
          { ...review, claim },
          account,
          randomUUID(),
          100n,
          1000n,
        ),
        status: "VERIFIED",
      });
    }
  const first = rows[0];
  if (!first) throw new Error("Missing quorum fixture");
  expect(readiness(policy, rows, 200n).offchainReady).toBe(false);
  expect(
    readiness(policy, [first, first], 200n).claims.find(
      (c) => c.claim === "INVOICE_ISSUED",
    )?.count,
  ).toBe(1);
  rows.push({
    review: { ...review, claim: "OWNER_APPROVED" },
    payload: map1For(
      proposal,
      { ...review, claim: "OWNER_APPROVED" },
      policy.ownerAccount,
      randomUUID(),
      100n,
      1000n,
    ),
    status: "VERIFIED",
  });
  expect(readiness(policy, rows, 200n).offchainReady).toBe(true);
  expect(readiness(policy, rows, 1000n).offchainReady).toBe(false);
  rows.push({ ...first, status: "DISPUTED" });
  expect(readiness(policy, rows, 200n).offchainReady).toBe(false);
});
it("agent selected in policy still cannot self-verify through M5", () => {
  expect(
    allowedReviewer(
      {
        ...policy,
        verifierPolicy: {
          ...policy.verifierPolicy,
          accounts: [policy.agentAccount],
        },
      },
      policy.agentAccount,
      "SERVICE_CONFIRMED",
    ),
  ).toBe(false);
});
it.each([
  ["owner", policy.ownerAccount],
  ["agent", policy.agentAccount],
  ["recipient", policy.recipient],
  ["vault", policy.vaultAccount],
] as const)(
  "%s cannot satisfy a third-party verifier claim",
  (_role, account) => {
    const unsafe = {
      ...policy,
      verifierPolicy: { ...policy.verifierPolicy, accounts: [account] },
    };
    expect(allowedReviewer(unsafe, account, "SERVICE_CONFIRMED")).toBe(false);
    const payload = map1For(
      proposal,
      review,
      account,
      randomUUID(),
      100n,
      1000n,
    );
    expect(validateMap1(payload, proposal, unsafe, 200n)).toBe(false);
    const summary = readiness(
      unsafe,
      [{ review, payload, status: "VERIFIED" }],
      200n,
    );
    expect(summary).toMatchObject({
      independentVerifierPolicy: false,
      offchainReady: false,
    });
    expect(summary.claims.every((claim) => claim.count === 0)).toBe(true);
  },
);
it("owner approval remains separate but cannot rescue an unsafe verifier policy", () => {
  const unsafe = mandatePolicy.parse({
    ...policy,
    verifierPolicy: {
      ...policy.verifierPolicy,
      accounts: [policy.ownerAccount],
      threshold: 1,
      requiredClaims: ["SERVICE_CONFIRMED"],
    },
  });
  const ownerReview = reviewInput.parse({
    ...review,
    claim: "OWNER_APPROVED",
    observation: {
      ...review.observation,
      source: "OWNER_DECISION",
      event: "OWNER_DECISION",
      independentlyObtained: false,
    },
  });
  const ownerPayload = map1For(
    proposal,
    ownerReview,
    policy.ownerAccount,
    randomUUID(),
    100n,
    1000n,
  );
  expect(allowedReviewer(unsafe, policy.ownerAccount, "OWNER_APPROVED")).toBe(
    true,
  );
  expect(
    readiness(
      unsafe,
      [{ review: ownerReview, payload: ownerPayload, status: "VERIFIED" }],
      200n,
    ).offchainReady,
  ).toBe(false);
});
it("reject without an independence declaration remains a valid denial", () => {
  expect(
    assessment(
      {
        ...review,
        decision: "REJECT",
        observation: { ...review.observation, independentlyObtained: false },
      },
      proposal,
      200n,
    ),
  ).toBe("REJECTED");
});
it("invoice cannot prove delivery and owner statement is not third-party evidence", () => {
  expect(
    assessment(
      {
        ...review,
        observation: { ...review.observation, event: "INVOICE_ISSUED" },
      },
      proposal,
      200n,
    ),
  ).toBe("CLAIM_MISMATCH");
  expect(
    assessment(
      {
        ...review,
        observation: { ...review.observation, source: "OWNER_DECISION" },
      },
      proposal,
      200n,
    ),
  ).toBe("INDEPENDENCE_REQUIRED");
  expect(
    assessment(
      {
        ...review,
        observation: { ...review.observation, independentlyObtained: false },
      },
      proposal,
      200n,
    ),
  ).toBe("INDEPENDENCE_REQUIRED");
});
it("synthetic dispute cannot masquerade as actual delivery dispute", () => {
  expect(
    assessment(
      {
        ...review,
        claim: "DELIVERY_DISPUTED",
        decision: "DISPUTE",
        observation: {
          ...review.observation,
          source: "LOCAL_EXERCISE",
          event: "DISPUTED",
        },
      },
      proposal,
      200n,
    ),
  ).toBe("SYNTHETIC_ONLY");
});
it("transaction preparation exposes exact contract args but never enables submission", () => {
  const intent = attestationIntent(proof, policy);
  expect(intent.args).toEqual({ evidence: proof });
  expect(intent.deposit).toBe("0");
  expect(intent.submissionEnabled).toBe(false);
  expect(
    attestationIntent(
      {
        ...proof,
        claim_type: "OWNER_APPROVED",
        verifier_account: policy.ownerAccount,
      },
      policy,
    ).deposit,
  ).toBe("1");
});
it("metadata rejects blobs, URLs, oversized document descriptions and unknown authority", () => {
  const input = {
    sourceType: "HUMAN_REVIEW",
    issuer: "Issuer",
    reference: "INV-1",
    evidenceDigest: proposal.evidenceDigest,
    mediaType: "application/pdf",
    byteLength: 20,
  };
  expect(evidenceInput.safeParse(input).success).toBe(true);
  for (const change of [
    { url: "https://evil.test" },
    { issuer: "http://127.0.0.1" },
    { file: "base64" },
    { verified: true },
    { reference: "x".repeat(121) },
    { byteLength: 0 },
  ])
    expect(evidenceInput.safeParse({ ...input, ...change }).success).toBe(
      false,
    );
});
it("pinned Meteor transaction preview contains only the exact attest_proposal call", async () => {
  const { meteorAttestationPreview } = await import(
    "../../apps/web/app/workspace/evidence/transaction-preview.js"
  );
  const p = meteorAttestationPreview(proof, proposal, policy, 200n);
  expect(p.transaction.receiverId).toBe(policy.vaultAccount);
  expect(p.transaction.actions).toEqual([
    {
      type: "FunctionCall",
      params: {
        methodName: "attest_proposal",
        args: { evidence: proof },
        gas: "30000000000000",
        deposit: "0",
      },
    },
  ]);
  expect(p.intent.submissionEnabled).toBe(false);
  expect(() =>
    meteorAttestationPreview(
      { ...proof, recipient: "evil.testnet" },
      proposal,
      policy,
      200n,
    ),
  ).toThrow("Invalid MAP-1 bindings");
});
it("rejects substituted policy even when the supplied proposal is unchanged", () => {
  expect(
    validateMap1(proof, proposal, { ...policy, mandateId: randomUUID() }, 200n),
  ).toBe(false);
  expect(
    validateMap1(
      proof,
      proposal,
      { ...policy, recipient: "evil.testnet" },
      200n,
    ),
  ).toBe(false);
});
