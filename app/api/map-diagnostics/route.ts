import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const javascriptKeyConfigured = Boolean(process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY && process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY !== "replace-with-kakao-javascript-key");
  const restKeyConfigured = Boolean(process.env.KAKAO_REST_KEY && process.env.KAKAO_REST_KEY !== "replace-with-kakao-rest-api-key");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const currentOrigin = getCurrentOrigin(request);
  const expectedDomains = uniqueStrings([
    currentOrigin,
    appUrl,
    "https://maju-intelligence-v2-deploy.vercel.app",
    "https://maju-intelligence-v2-deploy-a01055929144-3978s-projects.vercel.app",
    "https://maju-intelligence.vercel.app",
    "https://maju-intelligence-a01055929144-3978s-projects.vercel.app"
  ]);

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
      currentOrigin,
      expectedDomains
    },
    recommendations: buildRecommendations({ appUrl, currentOrigin, expectedDomains, javascriptKeyConfigured, restKeyConfigured })
  });
}

function buildRecommendations({
  appUrl,
  currentOrigin,
  expectedDomains,
  javascriptKeyConfigured,
  restKeyConfigured
}: {
  appUrl: string;
  currentOrigin: string;
  expectedDomains: string[];
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

  if (currentOrigin) {
    recommendations.push(`Kakao Developers의 JavaScript SDK 도메인에 현재 접속 도메인(${currentOrigin})을 등록하세요.`);
  }
  recommendations.push(`Kakao Developers Web 플랫폼 도메인 후보: ${expectedDomains.join(", ")}`);
  recommendations.push("브라우저 콘솔에서 dapi.kakao.com 스크립트 차단, Invalid appkey, unauthorized domain 오류를 확인하세요.");

  return recommendations;
}

function getCurrentOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host") || "";
  if (!host) return "";
  const protocol = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}
