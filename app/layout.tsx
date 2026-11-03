import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://maju-intelligence.vercel.app";

const majuSans = Noto_Sans_KR({
  weight: "variable",
  display: "swap",
  preload: false,
  variable: "--font-maju-sans",
  fallback: ["Apple SD Gothic Neo", "Malgun Gothic", "sans-serif"]
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "MAJU",
  description: "식자재 유통사의 영업·주문·배송을 한 화면에서 관리하는 MAJU입니다.",
  openGraph: {
    title: "MAJU",
    description: "식자재 유통사의 영업·주문·배송을 한 화면에서 관리하는 MAJU입니다.",
    siteName: "MAJU",
    locale: "ko_KR",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "MAJU",
    description: "식자재 유통사의 영업·주문·배송을 한 화면에서 관리하는 MAJU입니다."
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={majuSans.variable}>{children}</body>
    </html>
  );
}
