import type { Metadata } from "next";
import "./styles.css";
export const metadata: Metadata = {
  title: "Avroqen | Financial delegation",
  description:
    "Bounded agent proposals, independent verification and explicit wallet authorization.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
