const boundaries = [
  [
    "01",
    "Owners authorize",
    "Typed mandates define recipients, limits and expiry.",
  ],
  [
    "02",
    "Agents propose",
    "Agents submit bounded proposals without custody keys.",
  ],
  [
    "03",
    "Verifiers attest",
    "Independent evidence supports precisely scoped claims.",
  ],
  [
    "04",
    "The vault enforces",
    "Onchain checks govern reservations and settlement.",
  ],
];
export default function Home() {
  return (
    <main>
      <header>
        <span className="brand">
          Avroqen<span className="dot">.</span>
        </span>
        <span className="badge">Controlled Testnet prototype</span>
      </header>
      <section className="hero">
        <p className="eyebrow">TASK-BOUND FINANCIAL AUTHORITY</p>
        <h1>
          Authority stays
          <br />
          with the owner.
        </h1>
        <p className="intro">
          A workspace for agents that propose, independent verifiers that
          attest, and a vault that enforces the terms.
        </p>
        <aside>
          <strong>Public transactions require separate authorization.</strong>
          <p>
            Connect your wallet, define a mandate and review each approval. No
            public deployment or payment is implied by this workspace.
          </p>
        </aside>
        <a className="button-link" href="/workspace/journey">
          Open your workspace →
        </a>
        <a className="button-link secondary" href="/demo">
          Explore SAMPLE demo
        </a>
      </section>
      <section aria-label="Security boundaries" className="grid">
        {boundaries.map(([number, title, description]) => (
          <article key={number}>
            <span className="number">{number}</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>
      <footer>
        Owner control. Bounded authority. Verifiable outcomes.
        <span>Unaudited · Local development</span>
      </footer>
    </main>
  );
}
