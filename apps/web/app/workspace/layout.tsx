"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const links = [
  ["/workspace/journey", "Journey"],
  ["/workspace", "Wallet & organization"],
  ["/workspace/mandates", "Mandates"],
  ["/workspace/proposals", "Proposals"],
  ["/workspace/evidence", "Evidence"],
  ["/workspace/settlement", "Settlement"],
  ["/workspace/security", "Security"],
] as const;
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <>
      <nav
        aria-label="Workspace steps"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          padding: "1rem",
        }}
      >
        {links.map(([href, name]) => (
          <Link
            key={href}
            href={href}
            aria-current={path === href ? "page" : undefined}
          >
            {name}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
