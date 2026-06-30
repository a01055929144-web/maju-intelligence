import { NextResponse } from "next/server";
import { getLatestBriefing } from "@/lib/store";

export async function GET() {
  return NextResponse.json(await getLatestBriefing());
}
