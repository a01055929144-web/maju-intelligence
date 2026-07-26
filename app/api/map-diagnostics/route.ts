import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const javascriptKeyConfigured = Boolean(process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY && process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY !== "replace-with-kakao-javascript-key");
  const restKeyConfigured = Boolean(process.env.KAKAO_REST_KEY && process.env.KAKAO_REST_KEY !== "replace-with-kakao-rest-api-key");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    kakao: {
      javascriptKeyConfigured,
      restKeyConfigured,
      sdkHost: "https://dapi.kakao.com",
      sdkRequiresJavaScriptDomainRegistration: true
    },
    production: {
      appUrl,
      expectedDomains: [
        "https://maju-intelligence.vercel.app",
        "https://maju-intelligence-a01055929144-3978s-projects.vercel.app",
        appUrl
      ].filter(Boolean)
    },
    recommendations: buildRecommendations({ appUrl, javascriptKeyConfigured, restKeyConfigured })
  });
}

function buildRecommendations({
  appUrl,
  javascriptKeyConfigured,
  restKeyConfigured
}: {
  appUrl: string;
  javascriptKeyConfigured: boolean;
  restKeyConfigured: boolean;
}) {
  const recommendations: string[] = [];

  if (!javascriptKeyConfigured) {
    recommendations.push("Vercel Production에 NEXT_PUBLIC_KAKAO_MAP_APP_KEY를 등록하고 재배포하세요.");
  }
  if (!restKeyConfigured) {
    recommendations.push("주소 검색과 수기 등록을 위해 KAKAO_REST_KEY를 등록하세요.");
  }
  if (!appUrl) {
    recommendations.push("NEXT_PUBLIC_APP_URL을 Production URL로 등록하세요.");
  }

  recommendations.push("Kakao Developers의 JavaScript SDK 도메인에 maju-intelligence.vercel.app 및 현재 Vercel 배포 도메인을 등록하세요.");
  recommendations.push("브라우저 콘솔에서 dapi.kakao.com 스크립트 차단, Invalid appkey, unauthorized domain 오류를 확인하세요.");

  return recommendations;
}
