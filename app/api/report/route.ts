import { NextResponse } from "next/server";
import { getLatestReport } from "@/lib/store";

export async function GET() {
  return NextResponse.json(await getLatestReport());
}
