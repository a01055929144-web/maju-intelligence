import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { getCompanyOriginAddress, saveRouteDistanceCache } from "@/lib/store";
import { calculateRouteDistance } from "@/lib/tmap";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawDestinations = Array.isArray(body?.destinations) ? body.destinations : [];
  const destinations = Array.from(
    new Set<string>(rawDestinations.map((address: unknown) => String(address || "").trim()).filter(Boolean))
  ).slice(0, 25);

  if (!destinations.length) {
    return NextResponse.json({ error: "계산할 목적지 주소가 필요합니다." }, { status: 400 });
  }

  const companyId = scope.companyId;
  const originAddress = String(body?.originAddress || (await getCompanyOriginAddress(companyId))).trim();
  const routes = [];

  // 2026-08-24 피드백("전체 거래처 0km가 되네") 대응으로 이 엔드포인트를 처음 "전체 거래처" 패널에서도
  // 호출해보니, saveRouteDistanceCache가 Supabase 오류(예: 캐시 테이블 제약조건 문제)로 실패할 때
  // 예외가 그대로 새어나가 Next.js가 빈 본문의 500만 돌려주고 있었습니다. 어느 주소에서 실패했는지,
  // 왜 실패했는지 클라이언트가 알 수 있도록 각 주소를 개별적으로 처리하고 실패는 건너뛰되 기록합니다.
  const failures: Array<{ address: string; message: string }> = [];

  for (const destinationAddress of destinations) {
    try {
      const result = await calculateRouteDistance(originAddress, destinationAddress);
      const saved = await saveRouteDistanceCache(companyId, result);
      routes.push(saved);
    } catch (error) {
      failures.push({ address: destinationAddress, message: error instanceof Error ? error.message : String(error) });
    }
  }

  const totalDistanceKm = Math.round(routes.reduce((total, route) => total + Number(route.distanceKm || 0), 0) * 10) / 10;
  const totalDurationMinutes = routes.reduce((total, route) => total + Number(route.durationMinutes || 0), 0);

  if (!routes.length && failures.length) {
    return NextResponse.json({ error: failures[0].message, failures }, { status: 502 });
  }

  return NextResponse.json({
    routes,
    failures,
    summary: {
      count: routes.length,
      totalDistanceKm,
      totalDurationMinutes
    }
  });
}
