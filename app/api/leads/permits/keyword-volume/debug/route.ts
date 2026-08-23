import { NextRequest, NextResponse } from "next/server";

// 임시 진단용 엔드포인트입니다 — NCP 데이터랩(Search Trend) 전환 후에도 scores가 빈 값으로
// 오는 원인을 확인하기 위해서만 씁니다(원인 파악 후 삭제 예정, 2026-08-24). 자격 증명 값 자체는
// 절대 응답에 포함하지 않고, HTTP 상태코드와 본문 앞부분만 돌려줍니다.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== "maju-debug-2026") {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const clientId = (process.env.NCP_DATALAB_CLIENT_ID || "").trim();
  const clientSecret = (process.env.NCP_DATALAB_CLIENT_SECRET || "").trim();

  if (!clientId || !clientSecret) {
    return NextResponse.json({ configured: false, hasId: Boolean(clientId), hasSecret: Boolean(clientSecret) });
  }

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 90);
  const format = (d: Date) => d.toISOString().slice(0, 10);

  try {
    const response = await fetch("https://naveropenapi.apigw.ntruss.com/datalab/v1/search", {
      method: "POST",
      headers: {
        "X-NCP-APIGW-API-KEY-ID": clientId,
        "X-NCP-APIGW-API-KEY": clientSecret,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        startDate: format(startDate),
        endDate: format(endDate),
        timeUnit: "week",
        keywordGroups: [{ groupName: "커피", keywords: ["커피"] }]
      }),
      cache: "no-store"
    });
    const text = await response.text();
    return NextResponse.json({
      configured: true,
      idPreview: clientId.slice(0, 4) + "..." + clientId.slice(-2),
      idLength: clientId.length,
      secretLength: clientSecret.length,
      status: response.status,
      ok: response.ok,
      bodyPreview: text.slice(0, 500)
    });
  } catch (error) {
    return NextResponse.json({
      configured: true,
      idLength: clientId.length,
      secretLength: clientSecret.length,
      fetchError: error instanceof Error ? error.message : String(error)
    });
  }
}
