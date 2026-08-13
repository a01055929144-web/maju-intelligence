import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { resolveAddressPoint } from "@/lib/tmap";

/**
 * On-demand geocoding for a small set of addresses (used by the map quick-card's "길찾기"
 * action to resolve a single store's coordinates without waiting for a full route calculation).
 * Kept separate from /api/routes/sequence, which geocodes as a side effect of route ordering —
 * this endpoint is for callers that just need lat/lng for one or two addresses.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawAddresses = Array.isArray(body?.addresses) ? body.addresses : [];
  const addresses = Array.from(new Set<string>(rawAddresses.map((address: unknown) => String(address || "").trim()).filter(Boolean))).slice(
    0,
    10
  );

  if (!addresses.length) {
    return NextResponse.json({ error: "주소가 필요합니다." }, { status: 400 });
  }

  const entries = await Promise.all(addresses.map(async (address) => [address, await resolveAddressPoint(address)] as const));
  const points = Object.fromEntries(entries);

  return NextResponse.json({ points });
}
