import { NextResponse } from "next/server";
import { resolveSalesShortLink } from "@/lib/sales-kit-store";

export const dynamic = "force-dynamic";

/** 11/4: DM에 넣는 짧은 링크. 회사가 올린 영업 자료(10분 서명 링크)나 주문 링크로 보냅니다. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const target = await resolveSalesShortLink(code.toLowerCase());
  if (!target) return new NextResponse("링크가 만료되었거나 없는 자료입니다.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return NextResponse.redirect(target, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
