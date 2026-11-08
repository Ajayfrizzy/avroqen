import type { ReactNode } from "react";
import { PageHeader } from "../components/ui";
import { type SampleRoute, sampleRoute } from "./sample-data";

type Path = SampleRoute["path"];
export function SampleShell({
  path,
  children,
}: {
  path: Path;
  children: ReactNode;
}) {
  const route = sampleRoute(path);
  if (!route) throw new Error("SAMPLE_ROUTE_INVALID");
  return (
    <div className="sample-frame">
      <aside className="sample-sidebar">
        <p className="sample-caption">THE CONTROLLED JOURNEY</p>
        <nav aria-label="SAMPLE steps">
          <a href="/demo" aria-current={path === "/demo" ? "page" : undefined}>
            {sampleRoute("/demo")?.title}
          </a>
          <a
            href="/demo/mandate"
            aria-current={path === "/demo/mandate" ? "page" : undefined}
          >
            {sampleRoute("/demo/mandate")?.title}
          </a>
          <a
            href="/demo/proposal"
            aria-current={path === "/demo/proposal" ? "page" : undefined}
          >
            {sampleRoute("/demo/proposal")?.title}
          </a>
          <a
            href="/demo/review"
            aria-current={path === "/demo/review" ? "page" : undefined}
          >
            {sampleRoute("/demo/review")?.title}
          </a>
          <a
            href="/demo/outcomes"
            aria-current={path === "/demo/outcomes" ? "page" : undefined}
          >
            {sampleRoute("/demo/outcomes")?.title}
          </a>
          <a
            href="/demo/evidence"
            aria-current={path === "/demo/evidence" ? "page" : undefined}
          >
            {sampleRoute("/demo/evidence")?.title}
          </a>
        </nav>
        <p>Explore the limits. Keep authority separate.</p>
      </aside>
      <main id="demo-content" tabIndex={-1} className="sample-main">
        <PageHeader
          eyebrow="SAMPLE · JUDGE WALKTHROUGH"
          title={route.title}
          description={route.purpose}
        />
        {children}
        <nav
          aria-label="SAMPLE previous and next"
          className="sample-pagination"
        >
          {path === "/demo" && (
            <a href="/demo/mandate" className="button-link">
              Next: Mandate
            </a>
          )}
          {path === "/demo/mandate" && (
            <>
              <a href="/demo" className="button-link secondary">
                Previous: Start
              </a>
              <a href="/demo/proposal" className="button-link">
                Next: Agent proposal
              </a>
            </>
          )}
          {path === "/demo/proposal" && (
            <>
              <a href="/demo/mandate" className="button-link secondary">
                Previous: Mandate
              </a>
              <a href="/demo/review" className="button-link">
                Next: Independent review
              </a>
            </>
          )}
          {path === "/demo/review" && (
            <>
              <a href="/demo/proposal" className="button-link secondary">
                Previous: Agent proposal
              </a>
              <a href="/demo/outcomes" className="button-link">
                Next: Outcomes
              </a>
            </>
          )}
          {path === "/demo/outcomes" && (
            <>
              <a href="/demo/review" className="button-link secondary">
                Previous: Independent review
              </a>
              <a href="/demo/evidence" className="button-link">
                Next: Evidence and limits
              </a>
            </>
          )}
          {path === "/demo/evidence" && (
            <>
              <a href="/demo/outcomes" className="button-link secondary">
                Previous: Outcomes
              </a>
              <a href="/demo" className="button-link">
                Back to start
              </a>
            </>
          )}
        </nav>
      </main>
    </div>
  );
}
