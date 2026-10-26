import { NextRequest, NextResponse } from "next/server";
import { saveStaffLocationBatch } from "@/lib/staff-location-device-token";

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const deviceToken = authorization.startsWith("Device ") ? authorization.slice(7).trim() : "";
  if (!deviceToken) return NextResponse.json({ error: "기기 인증이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null) as { samples?: Array<Record<string, unknown>> } | null;
  const samples = Array.isArray(body?.samples) ? body.samples : [];
  if (!samples.length || samples.length > 100) return NextResponse.json({ error: "위치는 한 번에 1~100건만 전송할 수 있습니다." }, { status: 400 });
  if (samples.some((sample) => !Number.isFinite(Number(sample.latitude)) || !Number.isFinite(Number(sample.longitude)) || !Number.isFinite(Number(sample.accuracyM)))) {
    return NextResponse.json({ error: "위치 형식을 확인해 주세요." }, { status: 400 });
  }
  try {
    return NextResponse.json(await saveStaffLocationBatch(deviceToken, samples, request.headers.get("user-agent") || undefined));
  } catch (error) {
    const message = error instanceof Error ? error.message : "위치 일괄 저장에 실패했습니다.";
    if (message === "DEVICE_TOKEN_INVALID") return NextResponse.json({ error: "기기 인증이 만료됐거나 해제됐습니다." }, { status: 401 });
    if (/staff_location_device_tokens|schema cache|does not exist/i.test(message)) return NextResponse.json({ error: "기기 토큰 SQL 적용 후 사용할 수 있습니다." }, { status: 503 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
