import { NextResponse } from "next/server";
import { getPublicSalesQuote } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const quote = await getPublicSalesQuote(token);
  if (!quote) return NextResponse.json({ message: "만료되었거나 존재하지 않는 견적서입니다." }, { status: 404 });
  return NextResponse.json({ quote }, { headers: { "Cache-Control": "private, no-store" } });
}
