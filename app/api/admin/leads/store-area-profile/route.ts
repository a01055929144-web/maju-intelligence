import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getAdminStoreAreaProfile } from "@/lib/lead-store-area-profile";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await getAdminSession())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (process.env.ADMIN_LEAD_STORE_AREA_PROFILE_ENABLED !== "true" || process.env.ADMIN_LEAD_STORE_AREA_RPC_ENABLED !== "true") {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }
  const companyId = new URL(request.url).searchParams.get("companyId") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(companyId)) {
    return NextResponse.json({ message: "유효한 companyId가 필요합니다." }, { status: 400 });
  }

  try {
    return NextResponse.json(await getAdminStoreAreaProfile(companyId));
  } catch (error) {
    console.error("admin store-area aggregate failed", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    return NextResponse.json({ message: "집계에 실패했습니다." }, { status: 500 });
  }
}
