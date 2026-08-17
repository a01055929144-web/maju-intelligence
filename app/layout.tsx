import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://maju-intelligence.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "MAJU Intelligence",
  description: "거래처, 배송 코스, 매출 데이터를 한 화면에서 관리하는 마주식자재 영업·배송 운영 플랫폼입니다.",
  openGraph: {
    title: "MAJU Intelligence",
    description: "거래처, 배송 코스, 매출 데이터를 한 화면에서 관리하는 마주식자재 영업·배송 운영 플랫폼입니다.",
    siteName: "MAJU Intelligence",
    locale: "ko_KR",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "MAJU Intelligence",
    description: "거래처, 배송 코스, 매출 데이터를 한 화면에서 관리하는 마주식자재 영업·배송 운영 플랫폼입니다."
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
