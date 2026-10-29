import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { getAdminStoreAreaProfile } from "@/lib/lead-store-area-profile";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getAdminSession())) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (process.env.ADMIN_LEAD_STORE_AREA_PROFILE_ENABLED !== "true") {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  try {
    return NextResponse.json(await getAdminStoreAreaProfile());
  } catch (error) {
    console.error("admin store-area aggregate failed", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    return NextResponse.json({ message: "집계에 실패했습니다." }, { status: 500 });
  }
}
