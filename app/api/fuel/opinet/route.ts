import { NextResponse } from "next/server";
import { estimateFuelCostWon, getOpinetAverageFuelPrice } from "@/lib/opinet";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
