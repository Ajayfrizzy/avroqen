import type { ReactNode } from "react";
import { Badge, Icon } from "../components/ui";
import { SAMPLE_NOTICE } from "./sample-data";

export default function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="sample-layout">
      <a className="skip-link" href="#demo-content">
        Skip to SAMPLE content
      </a>
      <div className="sample-notice">
        <strong>{SAMPLE_NOTICE}</strong>
      </div>
      <header className="sample-topbar">
        <a href="/" className="brand">
          Avroqen<span className="dot">.</span>
        </a>
        <span className="sample-context">
          <Icon name="shield" />
          <Badge>No network connected</Badge>
        </span>
      </header>
      {children}
      <footer className="sample-footer">
        SAMPLE walkthrough · Read-only explanations · No payment authorization
      </footer>
    </div>
  );
}
