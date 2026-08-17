import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// TEMPORARY diagnostic route — checks each optional customer-master column tier individually
// against production Supabase, to pinpoint exactly which column(s) are still missing after
// migrations. Deleted immediately after use; not part of the feature.
async function probe(select: string) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return { select, ok: false, error: "no supabase config" };

  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/normalized_customers?select=${select}&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store"
  });
  if (response.ok) return { select, ok: true };
  const text = await response.text();
  return { select, ok: false, error: text };
}

export async function GET() {
  const results = await Promise.all([
    probe("naver_place_url"),
    probe("kakao_place_url"),
    probe("google_map_url"),
    probe("place_links_checked_at"),
    probe("business_hours"),
    probe("menu_summary"),
    probe("relationship_status"),
    probe("relationship_status_updated_at"),
    probe("relationship_status_note")
  ]);
  return NextResponse.json({ results });
}
