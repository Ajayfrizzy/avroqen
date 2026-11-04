"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { Badge, Dialog, Icon } from "./ui";

type Identity = {
  account?: string | undefined;
  organization?: string | undefined;
  network?: string | undefined;
};
const IdentityContext = createContext<(i: Identity) => void>(() => {});
export function useWorkspaceIdentity(
  account?: string,
  organization?: string,
  network?: string,
) {
  const set = useContext(IdentityContext);
  useEffect(() => {
    set({ account, organization, network });
    return () => set({});
  }, [account, organization, network, set]);
}
const links = [
  ["/workspace/journey", "Overview", "grid"],
  ["/workspace/mandates", "Mandates", "mandate"],
  ["/workspace/proposals", "Agents & proposals", "agent"],
  ["/workspace/evidence", "Verification", "shield"],
  ["/workspace/settlement", "Payments", "payment"],
  ["/workspace/security", "Security", "shield"],
  ["/workspace", "Organization", "settings"],
] as const;
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [identity, setIdentity] = useState<Identity>({});
  const [drawer, setDrawer] = useState(false),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const title = links.find(([href]) => href === path)?.[1] ?? "Workspace";
  const navigation = (
    <nav aria-label="Workspace navigation">
      {links.map(([href, label, icon]) => (
        <Link
          key={href}
          href={href}
          onClick={() => setDrawer(false)}
          aria-current={path === href ? "page" : undefined}
        >
          <Icon name={icon} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const s = await fetch("/api/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (s.status !== 401) {
        if (!s.ok) throw new Error();
        const session = await s.json();
        const r = await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": session.csrfToken,
          },
          body: "{}",
        });
        if (!r.ok) throw new Error();
      }
      window.location.assign("/workspace");
    } catch {
      setError("Could not sign out. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <IdentityContext.Provider value={setIdentity}>
      <div className="app-shell">
        <a className="skip-link" href="#workspace-content">
          Skip to content
        </a>
        <aside className="app-sidebar">
          <Link href="/workspace/journey" className="app-brand">
            <span className="brand-mark">A</span>Avroqen
            <span className="brand-point">.</span>
          </Link>
          <p className="sidebar-caption">FINANCIAL DELEGATION</p>
          {navigation}
          <div className="sidebar-bottom">
            <Icon name="shield" />
            <div>
              <strong>Bounded by design</strong>
              <p>
                Agents propose.
                <br />
                Your wallet authorizes.
              </p>
            </div>
          </div>
        </aside>
        <div className="app-body">
          <header className="app-topbar">
            <div className="topbar-left">
              <button
                type="button"
                className="icon-button mobile-menu secondary"
                aria-label="Open navigation"
                onClick={() => setDrawer(true)}
              >
                <Icon name="menu" />
              </button>
              <span className="breadcrumb">
                Workspace <span>/</span> <strong>{title}</strong>
              </span>
            </div>
            <div className="account-controls">
              <Badge tone="warning">
                {identity.network === "mainnet"
                  ? "Mainnet · unsupported"
                  : "Testnet"}
              </Badge>
              <Link href="/workspace" className="account-pill">
                <span className="avatar">
                  {identity.account?.slice(0, 1).toUpperCase() ?? (
                    <Icon name="wallet" size={16} />
                  )}
                </span>
                <span>
                  {identity.organization && (
                    <strong>{identity.organization}</strong>
                  )}
                  <small>{identity.account ?? "Connect your wallet"}</small>
                </span>
              </Link>
              {identity.account && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => void logout()}
                >
                  Sign out
                </button>
              )}
            </div>
          </header>
          {error && (
            <p className="shell-error" role="alert">
              {error}
            </p>
          )}
          <div id="workspace-content" tabIndex={-1}>
            {children}
          </div>
          <footer className="app-footer">
            <span>Avroqen · Controlled Testnet environment</span>
            <span>Wallet approvals stay with you.</span>
          </footer>
        </div>
        <Dialog
          open={drawer}
          onClose={() => setDrawer(false)}
          title="Avroqen navigation"
          className="navigation-drawer"
        >
          {navigation}
          <p className="drawer-account">
            {identity.account ?? "Wallet not connected"}
          </p>
        </Dialog>
      </div>
    </IdentityContext.Provider>
  );
}
