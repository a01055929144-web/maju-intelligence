import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MAJU Intelligence",
  description: "AI Sales Intelligence Platform for company diagnosis and lead briefing."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
