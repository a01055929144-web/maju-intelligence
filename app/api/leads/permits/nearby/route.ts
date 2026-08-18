import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { findNearbyPermitLeads } from "@/lib/store";

export const dynamic = "force-dynamic";

// POST: "리드 탐색"(AI 영업 세일즈) — 거래처 1곳 또는 전체 거래처 합집합 기준 반경 안의 신규 인허가
// 리드를 찾습니다. 지오코딩은 서버에서 처리하므로 클라이언트는 주소 문자열만 넘기면 됩니다.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        anchorCustomer?: { address?: string; id?: string; name?: string };
        anchorMode?: string;
        companyId?: string;
        radiusKm?: number;
      }
    | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const anchorMode = body?.anchorMode === "all" ? "all" : "customer";
  if (anchorMode === "customer" && !body?.anchorCustomer?.address) {
    return NextResponse.json({ message: "기준 거래처를 선택하세요." }, { status: 400 });
  }

  try {
    const result = await findNearbyPermitLeads(scope.companyId!, {
      anchorMode,
      anchorCustomer:
        anchorMode === "customer" && body?.anchorCustomer?.address
          ? {
              address: body.anchorCustomer.address,
              id: body.anchorCustomer.id || "",
              name: body.anchorCustomer.name || "선택 거래처"
            }
          : undefined,
      radiusKm: Number(body?.radiusKm) || 5
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("permit lead nearby search failed:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "리드 탐색 중 오류가 발생했습니다." }, { status: 500 });
  }
}
