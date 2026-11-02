import { randomUUID } from "node:crypto";
import { canonicalPolicy, mandatePolicy } from "@avroqen/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type pg from "pg";
import {
  boundMandate,
  vaultProposalState,
} from "../../../../packages/domain/src/chain-state.js";
import {
  assessment,
  map1,
  reviewInput,
} from "../../../../packages/domain/src/evidence.js";
import {
  canonicalProposal,
  proposalInput,
} from "../../../../packages/domain/src/proposals.js";
import {
  buildOperation,
  type ChainOperation,
  chainParams,
  hashReport,
  intentInput,
  intentParams,
  type OperationInput,
} from "../../../../packages/domain/src/settlement.js";
import {
  chainHash,
  type Manifest,
  NearReader,
} from "../../../../services/chain/rpc.js";
import { hash } from "../identity/crypto.js";
import type { Context } from "../mandates/routes.js";
export interface ChainConfig {
  manifest: Manifest | null;
  reader: NearReader;
}
export function chainRoutes(
  app: FastifyInstance,
  ctx: Context,
  chain: ChainConfig = { manifest: null, reader: new NearReader() },
) {
  const { session, transaction, deny, config } = ctx;
  const base = "/api/organizations/:orgId/mandates/:mandateId/chain";
  const enabled = () => {
    if (!chain.manifest || config.network !== "testnet")
      return deny(503, "DEPLOYMENT_NOT_AUTHORIZED");
    return chain.manifest;
  };
  async function load(
    db: pg.PoolClient,
    request: FastifyRequest,
    org: string,
    id: string,
    write: boolean,
  ) {
    const who = await session(request, db, write);
    const row = (
      await db.query(
        "SELECT p.*,c.status,a.disabled_at FROM mandate_policies p JOIN mandate_consents c ON c.mandate_id=p.id JOIN registered_agents a ON a.id=p.agent_id WHERE p.id=$1 AND p.org_id=$2 AND p.network=$3 FOR SHARE OF p,c,a",
        [id, org, config.network],
      )
    ).rows[0];
    if (!row) return deny(404, "MANDATE_NOT_FOUND");
    const policy = mandatePolicy.parse(JSON.parse(row.canonical_policy));
    if (
      canonicalPolicy(policy) !== row.canonical_policy ||
      hash(row.canonical_policy) !== row.policy_digest ||
      policy.organizationId !== org ||
      policy.mandateId !== id
    )
      return deny(503, "POLICY_INTEGRITY_FAILED");
    const role = (
      await db.query(
        "SELECT role FROM memberships WHERE org_id=$1 AND account_id=$2 AND network=$3 AND status='active' FOR SHARE",
        [org, who.account_id, config.network],
      )
    ).rows[0]?.role;
    const owner = who.account_id === policy.ownerAccount && role === "owner";
    if (
      !role &&
      who.account_id !== policy.agentAccount &&
      !policy.verifierPolicy.accounts.includes(who.account_id)
    )
      return deny(403, "ACCESS_DENIED");
    return { who, row, policy, owner, role };
  }
  // Read immutable policy under authorization locks, release them before RPC,
  // then operation() rechecks live session/membership under its write transaction.
  async function verifiedGuardian(
    request: FastifyRequest,
    org: string,
    id: string,
  ) {
    const data = await transaction((db) => load(db, request, org, id, true));
    if (data.owner || !data.role) return null;
    const manifest = enabled();
    if (data.policy.vaultAccount !== manifest.account)
      return deny(409, "VAULT_MISMATCH");
    const deployment = await chain.reader.deployment(manifest);
    return boundMandate(
      await chain.reader.view(
        manifest.account,
        "get_mandate",
        { mandate_id: id },
        deployment.block.hash,
      ),
      data.row.canonical_policy,
      data.row.policy_digest,
    ).guardian;
  }
  async function operation(
    db: pg.PoolClient,
    request: FastifyRequest,
    org: string,
    id: string,
    input: OperationInput,
    guardian: string | null = null,
  ) {
    const d = await load(db, request, org, id, true),
      manifest = enabled();
    if (d.policy.vaultAccount !== manifest.account)
      return deny(409, "VAULT_MISMATCH");
    const ownerKind = !["PROPOSE", "ATTEST"].includes(input.kind);
    if (
      (ownerKind || d.who.account_id === d.policy.ownerAccount) &&
      !d.owner &&
      !(input.kind === "PAUSE" && d.role && guardian === d.who.account_id)
    )
      return deny(403, "OWNER_REQUIRED");
    const emergency = [
      "PAUSE",
      "REVOKE",
      "WITHDRAW",
      "WITHDRAW_STORAGE",
    ].includes(input.kind);
    if (
      !emergency &&
      (d.row.status !== "CONSENT_APPROVED_OFFCHAIN" || d.row.disabled_at)
    )
      return deny(409, "CONSENT_OR_AGENT_UNAVAILABLE");
    let proposal:
      | import("../../../../packages/domain/src/proposals.js").ProposalInput
      | undefined;
    let evidence:
      | import("../../../../packages/domain/src/evidence.js").Map1
      | undefined;
    if ("proposalId" in input) {
      const row = (
        await db.query(
          "SELECT canonical_payload FROM agent_proposals WHERE id=$1 AND mandate_id=$2",
          [input.proposalId, id],
        )
      ).rows[0];
      if (!row) return deny(404, "PROPOSAL_NOT_FOUND");
      proposal = proposalInput.parse(JSON.parse(row.canonical_payload));
      if (canonicalProposal(proposal) !== row.canonical_payload)
        return deny(503, "PROPOSAL_INTEGRITY_FAILED");
    }
    const now = BigInt(
      (
        await db.query(
          "SELECT trunc(extract(epoch FROM clock_timestamp())*1000000000)::text AS ns",
        )
      ).rows[0].ns,
    );
    if (input.kind === "ATTEST") {
      const r = (
        await db.query(
          `SELECT r.*,p.canonical_payload AS proposal_payload FROM evidence_reviews r JOIN evidence_submissions e ON e.id=r.evidence_id JOIN agent_proposals p ON p.id=e.proposal_id WHERE r.id=$1 AND p.mandate_id=$2 AND r.actor_account=$3`,
          [input.reviewId, id, d.who.account_id],
        )
      ).rows[0];
      if (!r || !["VERIFIED", "DISPUTED"].includes(r.status))
        return deny(403, "VERIFIED_REVIEW_REQUIRED");
      proposal = proposalInput.parse(JSON.parse(r.proposal_payload));
      evidence = map1.parse(JSON.parse(r.canonical_payload));
      const review = reviewInput.parse(JSON.parse(r.canonical_review));
      if (
        review.observation.source === "LOCAL_EXERCISE" ||
        assessment(review, proposal, now) !== r.status
      )
        return deny(403, "AUTHENTIC_REVIEW_REQUIRED");
    }
    let built: ChainOperation;
    try {
      built = buildOperation(input, {
        policy: d.policy,
        policyDigest: d.row.policy_digest,
        actor: d.who.account_id,
        now,
        guardian,
        ...(proposal ? { proposal } : {}),
        ...(evidence ? { evidence } : {}),
      });
    } catch {
      return deny(409, "OPERATION_NOT_ALLOWED");
    }
    return { ...d, built };
  }
  app.get("/api/chain/assignments", async (request) => {
    const who = await session(request, ctx.pool);
    const rows = await ctx.pool.query(
      `SELECT p.canonical_policy FROM mandate_policies p WHERE p.network=$1 AND (p.owner_account=$2 AND EXISTS(SELECT 1 FROM memberships m WHERE m.org_id=p.org_id AND m.account_id=$2 AND m.role='owner' AND m.status='active') OR EXISTS(SELECT 1 FROM memberships m WHERE m.org_id=p.org_id AND m.account_id=$2 AND m.network=p.network AND m.status='active') OR p.agent_account=$2 OR p.canonical_policy::jsonb->'verifierPolicy'->'accounts' ? $2) ORDER BY p.id LIMIT 50`,
      [config.network, who.account_id],
    );
    return {
      mandates: rows.rows.map((r) =>
        mandatePolicy.parse(JSON.parse(r.canonical_policy)),
      ),
    };
  });
  app.get("/api/chain/status", async (request) => {
    await session(request, ctx.pool);
    if (!chain.manifest)
      return {
        status: "NOT_AUTHORIZED",
        network: "testnet",
        submissionEnabled: false,
      };
    try {
      const d = await chain.reader.deployment(chain.manifest);
      return {
        status: "VERIFIED",
        network: "testnet",
        account: chain.manifest.account,
        submissionEnabled: true,
        block: d.block,
        accounting: d.accounting,
      };
    } catch {
      return {
        status: "UNAVAILABLE",
        network: "testnet",
        submissionEnabled: false,
      };
    }
  });
  app.get(base, async (request) => {
    const { orgId, mandateId } = chainParams.parse(request.params);
    const data = await transaction((db) =>
      load(db, request, orgId, mandateId, false),
    );
    const intents = await ctx.pool.query(
      `SELECT id,actor_account,canonical_operation,state,reason,verified_hash,receipt_ids,last_height,last_block_hash,created_at FROM chain_intents WHERE org_id=$1 AND mandate_id=$2 AND ($3 OR actor_account=$4) ORDER BY created_at DESC LIMIT 50`,
      [orgId, mandateId, data.owner, data.who.account_id],
    );
    const onchainProposals: Record<string, unknown> = {};
    let onchain: unknown = null,
      block: unknown = null;
    if (chain.manifest && chain.manifest.account === data.policy.vaultAccount) {
      try {
        const d = await chain.reader.deployment(chain.manifest);
        const raw = await chain.reader.view(
          chain.manifest.account,
          "get_mandate",
          { mandate_id: mandateId },
          d.block.hash,
        );
        onchain =
          raw === null
            ? null
            : boundMandate(
                raw,
                data.row.canonical_policy,
                data.row.policy_digest,
              );
        const rows = await ctx.pool.query(
          "SELECT canonical_payload FROM agent_proposals WHERE mandate_id=$1 ORDER BY created_at DESC LIMIT 20",
          [mandateId],
        );
        for (const row of rows.rows) {
          const p = proposalInput.parse(JSON.parse(row.canonical_payload));
          const value = await chain.reader.view(
            chain.manifest.account,
            "get_proposal",
            { mandate_id: mandateId, proposal_id: p.proposalId },
            d.block.hash,
          );
          if (value === null) continue;
          const v = vaultProposalState.parse(value);
          if (
            v.id !== p.proposalId ||
            v.mandate_id !== mandateId ||
            v.recipient !== p.recipient ||
            v.amount !== p.amountAtomic ||
            v.evidence_digest !== p.evidenceDigest
          )
            throw new Error("ONCHAIN_PROPOSAL_MISMATCH");
          onchainProposals[p.proposalId] = v;
        }
        block = d.block;
      } catch {
        onchain = null;
        block = null;
        for (const id of Object.keys(onchainProposals))
          delete onchainProposals[id];
      }
    }
    const proposals = await ctx.pool.query(
      "SELECT canonical_payload FROM agent_proposals WHERE mandate_id=$1 ORDER BY created_at DESC LIMIT 50",
      [mandateId],
    );
    const reviews = await ctx.pool.query(
      "SELECT r.id,r.canonical_payload FROM evidence_reviews r JOIN evidence_submissions e ON e.id=r.evidence_id JOIN agent_proposals p ON p.id=e.proposal_id WHERE p.mandate_id=$1 AND r.actor_account=$2 AND r.status IN ('VERIFIED','DISPUTED') ORDER BY r.created_at DESC LIMIT 50",
      [mandateId, data.who.account_id],
    );
    return {
      onchainProposals,
      proposals: proposals.rows.map((r) =>
        proposalInput.parse(JSON.parse(r.canonical_payload)),
      ),
      reviews: reviews.rows.map((r) => ({
        id: r.id,
        payload: map1.parse(JSON.parse(r.canonical_payload)),
      })),
      intents: intents.rows.map((r) => ({
        ...r,
        operation: JSON.parse(r.canonical_operation),
        canonical_operation: undefined,
        explorerUrl: r.verified_hash
          ? `https://testnet.nearblocks.io/txns/${r.verified_hash}`
          : null,
      })),
      onchain,
      block,
      policy: data.policy,
    };
  });
  app.post(`${base}/intents`, async (request, reply) => {
    const { orgId, mandateId } = chainParams.parse(request.params),
      input = intentInput.parse(request.body),
      manifest = enabled();
    const guardian =
      input.operation.kind === "PAUSE"
        ? await verifiedGuardian(request, orgId, mandateId)
        : null;
    // Authorize before allowing remote work; repeat authorization after network I/O.
    await transaction((db) =>
      operation(db, request, orgId, mandateId, input.operation, guardian),
    );
    const verified = await chain.reader.deployment(manifest);
    const result = await transaction(async (db) => {
      const data = await operation(
        db,
        request,
        orgId,
        mandateId,
        input.operation,
        guardian,
      );
      // Serialize local preparation for one wallet/vault, including concurrent idempotent requests.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `${data.who.account_id}:${manifest.account}`,
      ]);
      await session(request, db, true);
      const previous = (
        await db.query(
          "SELECT * FROM chain_intents WHERE actor_account=$1 AND idempotency_key=$2",
          [data.who.account_id, input.idempotencyKey],
        )
      ).rows[0];
      const canonical = JSON.stringify(data.built);
      if (previous) {
        if (
          previous.canonical_operation !== canonical ||
          previous.org_id !== orgId
        )
          return deny(409, "IDEMPOTENCY_CONFLICT");
        return {
          id: previous.id,
          operation: data.built,
          state: previous.state,
        };
      }
      if (
        (
          await db.query(
            "SELECT 1 FROM chain_intents WHERE actor_account=$1 AND vault_account=$2 AND state NOT IN ('CONFIRMED_SUCCESS','CONFIRMED_FAILED')",
            [data.who.account_id, manifest.account],
          )
        ).rowCount
      )
        return deny(409, "UNRESOLVED_OPERATION");
      const id = randomUUID(),
        anchor = verified.block;
      await db.query(
        `INSERT INTO chain_intents(id,org_id,mandate_id,actor_account,network,vault_account,idempotency_key,canonical_operation,manifest,anchor_height,anchor_hash,scan_height,scan_hash) VALUES($1,$2,$3,$4,'testnet',$5,$6,$7,$8,$9,$10,$9,$10)`,
        [
          id,
          orgId,
          mandateId,
          data.who.account_id,
          manifest.account,
          input.idempotencyKey,
          canonical,
          JSON.stringify(manifest),
          anchor.height,
          anchor.hash,
        ],
      );
      await db.query(
        "INSERT INTO chain_events(intent_id,state,reason) VALUES($1,'PREPARED','UNSIGNED')",
        [id],
      );
      return { id, operation: data.built, state: "PREPARED" };
    });
    return reply.code(201).send(result);
  });
  async function owned(db: pg.PoolClient, request: FastifyRequest) {
    const { intentId } = intentParams.parse(request.params),
      who = await session(request, db, true);
    const r = (
      await db.query(
        "SELECT * FROM chain_intents WHERE id=$1 AND actor_account=$2 FOR UPDATE",
        [intentId, who.account_id],
      )
    ).rows[0];
    if (!r) return deny(404, "INTENT_NOT_FOUND");
    return r;
  }
  app.post("/api/chain/intents/:intentId/begin", async (request) => {
    const manifest = enabled();
    await chain.reader.deployment(manifest);
    const initial = await transaction((db) => owned(db, request));
    if (initial.state !== "PREPARED")
      return deny(409, "INTENT_ALREADY_ATTEMPTED");
    const guardian =
      (JSON.parse(initial.canonical_operation) as ChainOperation).kind ===
      "PAUSE"
        ? await verifiedGuardian(request, initial.org_id, initial.mandate_id)
        : null;
    return transaction(async (db) => {
      const r = await owned(db, request);
      if (r.state !== "PREPARED") return deny(409, "INTENT_ALREADY_ATTEMPTED");
      // Rebuild the original operation from immutable inputs; stale app authority cannot open a prompt.
      const op = JSON.parse(r.canonical_operation) as ChainOperation;
      const input: Record<string, unknown> = { kind: op.kind };
      if (["FUND", "STORAGE_DEPOSIT"].includes(op.kind))
        input.amount = op.deposit;
      if (["WITHDRAW", "WITHDRAW_STORAGE"].includes(op.kind))
        input.amount = op.args.amount;
      if (op.kind === "REGISTER") {
        input.storageLimit = op.args.storage_limit;
        input.guardian = op.args.guardian;
      }
      if (["PROPOSE", "EXECUTE"].includes(op.kind))
        input.proposalId = op.args.proposal_id;
      if (op.kind === "ATTEST") {
        const e = map1.parse(op.args.evidence);
        const review = (
          await db.query(
            "SELECT id FROM evidence_reviews WHERE actor_account=$1 AND attestation_nonce=$2",
            [op.signerId, e.nonce],
          )
        ).rows[0];
        if (!review) return deny(403, "VERIFIED_REVIEW_REQUIRED");
        input.reviewId = review.id;
      }
      const rebuilt = await operation(
        db,
        request,
        r.org_id,
        r.mandate_id,
        intentInput.shape.operation.parse(input),
        guardian,
      );
      if (
        JSON.stringify(rebuilt.built) !== r.canonical_operation ||
        r.manifest.wasmSha256 !== manifest.wasmSha256 ||
        r.manifest.authorization !== manifest.authorization ||
        r.manifest.account !== manifest.account ||
        r.manifest.network !== manifest.network ||
        JSON.stringify([...r.manifest.keyFingerprints].sort()) !==
          JSON.stringify([...manifest.keyFingerprints].sort())
      )
        return deny(409, "INTENT_CONFIGURATION_CHANGED");
      await db.query(
        "UPDATE chain_intents SET state='AWAITING_WALLET',reason='WALLET_PROMPT_OPENING',updated_at=clock_timestamp() WHERE id=$1",
        [r.id],
      );
      await db.query(
        "INSERT INTO chain_events(intent_id,state,reason) VALUES($1,'AWAITING_WALLET','WALLET_PROMPT_OPENING')",
        [r.id],
      );
      return { id: r.id, operation: rebuilt.built, state: "AWAITING_WALLET" };
    });
  });
  app.post("/api/chain/intents/:intentId/report", async (request) => {
    const input = hashReport.parse(request.body);
    if (input.hash) chainHash.parse(input.hash);
    return transaction(async (db) => {
      const r = await owned(db, request);
      if (r.state === "PREPARED") return deny(409, "INTENT_NOT_STARTED");
      if (["CONFIRMED_SUCCESS", "CONFIRMED_FAILED"].includes(r.state))
        return { state: r.state };
      if (r.reported_hash && input.hash !== r.reported_hash)
        return deny(409, "HASH_ALREADY_REPORTED");
      const state = input.hash ? "BROADCAST_REPORTED" : "UNKNOWN",
        reason = input.hash
          ? "UNVERIFIED_WALLET_HASH"
          : "WALLET_OUTCOME_UNKNOWN";
      await db.query(
        "UPDATE chain_intents SET state=$2,reason=$3,reported_hash=$4,next_check=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1",
        [r.id, state, reason, input.hash],
      );
      await db.query(
        "INSERT INTO chain_events(intent_id,state,reason) VALUES($1,$2,$3)",
        [r.id, state, reason],
      );
      return { state };
    });
  });
}
