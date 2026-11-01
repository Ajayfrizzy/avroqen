import type { Metadata } from "next";
import "./styles.css";
export const metadata: Metadata = {
  title: "Avroqen | Foundation",
  description:
    "Owner-controlled financial authority for agents. Development foundation.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
