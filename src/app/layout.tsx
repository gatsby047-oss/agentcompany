import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Agent Company MVP",
  description: "OpenClaw-first agent orchestration SaaS MVP"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hans">
      <body>{children}</body>
    </html>
  );
}
