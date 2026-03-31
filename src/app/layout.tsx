import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Agent Company | Interview Edition",
  description:
    "Workflow-driven multi-agent orchestration with managed providers, task-level observability, and offline evaluation."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
