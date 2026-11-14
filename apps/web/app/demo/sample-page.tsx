import type { ReactNode } from "react";
import {
  Badge,
  Card,
  TechnicalDetails,
  TransactionSummary,
} from "../components/ui";
import { sampleEvidenceTitle, sampleNear, sampleStatus } from "./format";
import { SAMPLE, type SampleRoute } from "./sample-data";
import { SampleShell } from "./sample-shell";

function SampleCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="sample-card">
      <Card>
        <Badge tone="warning">{SAMPLE.kind}</Badge>
        <h2>{title}</h2>
        {children}
      </Card>
    </div>
  );
}
function ProposalCards({ permittedOnly = false }: { permittedOnly?: boolean }) {
  return SAMPLE.proposals
    .filter((p) => !permittedOnly || p.eligibility === "WITHIN_SAMPLE_POLICY")
    .map((proposal) => (
      <SampleCard
        key={proposal.id}
        title={
          proposal.eligibility === "WITHIN_SAMPLE_POLICY"
            ? "Within sample policy"
            : "Over-cap proposal rejected"
        }
      >
        <p className="sample-amount">{sampleNear(proposal.amountAtomic)}</p>
        <p>{proposal.explanation}</p>
        <TransactionSummary
          entries={[
            {
              label: "Policy eligibility",
              value: sampleStatus(proposal.eligibility),
            },
            {
              label: "Payment authorization",
              value: sampleStatus(proposal.authorization),
            },
            { label: "Evidence", value: sampleStatus(proposal.evidence) },
            { label: "Settlement", value: sampleStatus(proposal.settlement) },
          ]}
        />
        <TechnicalDetails title="Exact proposal terms">
          <TransactionSummary
            entries={[
              { label: "Policy eligibility code", value: proposal.eligibility },
              {
                label: "Payment authorization code",
                value: proposal.authorization,
              },
              { label: "Evidence code", value: proposal.evidence },
              { label: "Settlement code", value: proposal.settlement },
            ]}
          />
          <p>
            Identifier: <code>{proposal.id}</code>
          </p>
          <p>
            Atomic amount: <code>{proposal.amountAtomic}</code>
          </p>
        </TechnicalDetails>
      </SampleCard>
    ));
}
export function SamplePage({ path }: { path: SampleRoute["path"] }) {
  return (
    <SampleShell path={path}>
      {path === "/demo" && (
        <>
          <SampleCard title={SAMPLE.organization.name}>
            <p className="sample-lead">
              Bounded proposals. Independent review. Authority stays with the
              owner.
            </p>
            <p>{SAMPLE.mandate.task}</p>
            <p>
              This fictional walkthrough explains the product without an
              account, wallet or funded vault.
            </p>
          </SampleCard>
          <div className="sample-grid">
            {SAMPLE.roles.map((role) => (
              <SampleCard key={role.id} title={role.name}>
                <p>{role.authority}</p>
              </SampleCard>
            ))}
          </div>
        </>
      )}
      {path === "/demo/mandate" && (
        <SampleCard title="The limits come first">
          <p>{SAMPLE.mandate.task}</p>
          <TransactionSummary
            entries={[
              {
                label: "SAMPLE total policy ceiling",
                value: sampleNear(SAMPLE.mandate.totalAtomic),
              },
              {
                label: "SAMPLE per-payment cap",
                value: sampleNear(SAMPLE.mandate.perPaymentAtomic),
              },
              {
                label: "Maximum executions",
                value: SAMPLE.mandate.maxExecutions,
              },
              {
                label: "Permitted recipient alias",
                value: SAMPLE.mandate.recipient,
              },
              {
                label: "Funding observation",
                value: sampleStatus(SAMPLE.mandate.funding),
              },
            ]}
          />
          <p>{SAMPLE.mandate.explanation}</p>
          <p>{SAMPLE.mandate.timeRule}</p>
          <TechnicalDetails title="Exact atomic units">
            <p>
              Funding observation code: <code>{SAMPLE.mandate.funding}</code>
            </p>
            <dl>
              <dt>Total ceiling</dt>
              <dd>
                <code>{SAMPLE.mandate.totalAtomic}</code>
              </dd>
              <dt>Per-payment cap</dt>
              <dd>
                <code>{SAMPLE.mandate.perPaymentAtomic}</code>
              </dd>
            </dl>
          </TechnicalDetails>
        </SampleCard>
      )}
      {path === "/demo/proposal" && <ProposalCards permittedOnly />}
      {path === "/demo/review" && (
        <SampleCard title="What independent review means">
          <p>{SAMPLE.review.explanation}</p>
          <ol className="sample-checks">
            {SAMPLE.review.checks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ol>
          <TechnicalDetails title="Illustrative claim scope">
            <p>{SAMPLE.review.claim}</p>
            <p>
              These are explanations, not signed approvals or verified source
              records.
            </p>
          </TechnicalDetails>
        </SampleCard>
      )}
      {path === "/demo/outcomes" && (
        <>
          <div className="sample-grid">
            <ProposalCards />
          </div>
          {SAMPLE.states.map((state) => (
            <SampleCard key={state.id} title={state.title}>
              <p>{state.explanation}</p>
            </SampleCard>
          ))}
        </>
      )}
      {path === "/demo/evidence" && (
        <>
          <SampleCard title="Traceability without invented proof">
            <p>{SAMPLE.audit.explanation}</p>
            <ul>
              {SAMPLE.audit.references.map((reference) => (
                <li key={reference}>
                  <code>{reference}</code>
                </li>
              ))}
            </ul>
          </SampleCard>
          <div className="sample-grid">
            {SAMPLE.evidenceClasses.map((category) => (
              <SampleCard
                key={category.kind}
                title={sampleEvidenceTitle(category.kind)}
              >
                <p>{category.explanation}</p>
                <TechnicalDetails title="Evidence category code">
                  <code>{category.kind}</code>
                </TechnicalDetails>
              </SampleCard>
            ))}
          </div>
          <SampleCard title="What this walkthrough cannot establish">
            <p>
              Genuine independent-source access, verifier and owner signing,
              authorized public settlement and recipient deltas, emergency
              recovery and integrated physical Android wallet acceptance remain
              separate M8 gates. No independent security audit is claimed.
            </p>
            <TransactionSummary
              entries={[
                {
                  label: "Primary-key proof",
                  value: sampleStatus(SAMPLE.safety.primaryProof),
                },
                {
                  label: "Temporary Testing FullAccess key",
                  value: sampleStatus(SAMPLE.safety.testingKey),
                },
                {
                  label: "Financial operations",
                  value: sampleStatus(SAMPLE.safety.financialOperations),
                },
              ]}
            />
            <TechnicalDetails title="Exact restriction codes">
              <TransactionSummary
                entries={[
                  {
                    label: "Primary-key proof code",
                    value: SAMPLE.safety.primaryProof,
                  },
                  {
                    label: "Testing key code",
                    value: SAMPLE.safety.testingKey,
                  },
                  {
                    label: "Financial operations code",
                    value: SAMPLE.safety.financialOperations,
                  },
                ]}
              />
            </TechnicalDetails>
            <p>
              The archived private Meteor integration remains stopped. A
              deployment or initialization transaction is never a payment
              receipt. Full M9 release and hosted acceptance are not established
              here.
            </p>
          </SampleCard>
        </>
      )}
    </SampleShell>
  );
}
