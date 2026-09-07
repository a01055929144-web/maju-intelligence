import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { estimateFuelCostWon, getOpinetAverageFuelPrice } from "@/lib/opinet";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // 로그인한 사용자만 오피넷 API 쿼터를 소모하도록 제한합니다(비로그인 직접 호출 방지).
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const fuelType = url.searchParams.get("fuelType") === "gasoline" ? "gasoline" : "diesel";
  const distanceKm = Number(url.searchParams.get("distanceKm") || 0);
  const mileageKmPerLiter = Number(url.searchParams.get("mileageKmPerLiter") || 7.5);
  const fuelPrice = await getOpinetAverageFuelPrice(fuelType);
  const estimatedFuelCostWon = estimateFuelCostWon(distanceKm, fuelPrice.pricePerLiter, mileageKmPerLiter);

  return NextResponse.json({
    ...fuelPrice,
    distanceKm,
    estimatedFuelCostWon,
    keyConfigured: Boolean(process.env.OPINET_API_KEY?.trim())
  });
}
