import { NextResponse } from "next/server";
import { getLatestLeads } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getLatestLeads());
}
