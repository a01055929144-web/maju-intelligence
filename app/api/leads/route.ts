import { NextResponse } from "next/server";
import { getLatestLeads } from "@/lib/store";

export async function GET() {
  return NextResponse.json(await getLatestLeads());
}
