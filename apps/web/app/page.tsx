const boundaries = [
  [
    "01",
    "Owners authorize",
    "Typed mandates will define recipients, limits and expiry.",
  ],
  [
    "02",
    "Agents propose",
    "Agents will submit bounded proposals without custody keys.",
  ],
  [
    "03",
    "Verifiers attest",
    "Independent evidence will support precisely scoped claims.",
  ],
  [
    "04",
    "The vault enforces",
    "Onchain checks will govern reservations and settlement.",
  ],
];
export default function Home() {
  return (
    <main>
      <header>
        <span className="brand">
          Avroqen<span className="dot">.</span>
        </span>
        <span className="badge">M0 · Development foundation</span>
      </header>
      <section className="hero">
        <p className="eyebrow">TASK-BOUND FINANCIAL AUTHORITY</p>
        <h1>
          Authority stays
          <br />
          with the owner.
        </h1>
        <p className="intro">
          A foundation for agents that propose, independent verifiers that
          attest, and a vault that enforces the terms.
        </p>
        <aside>
          <strong>Payments are not enabled.</strong>
          <p>
            This is the development foundation. Wallet authorization, custody,
            verification and settlement are not implemented. No funds or
            blockchain activity are shown.
          </p>
        </aside>
      </section>
      <section aria-label="Planned security boundaries" className="grid">
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
