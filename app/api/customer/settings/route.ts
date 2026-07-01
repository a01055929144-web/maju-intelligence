import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth";
import { updateCompanySettings } from "@/lib/store";

export async function PATCH(request: Request) {
  const session = getCustomerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.name) {
    return NextResponse.json({ error: "회사명은 필수입니다." }, { status: 400 });
  }

  const result = await updateCompanySettings(session.companyId, {
    businessType: body.businessType,
    name: body.name,
    originAddress: body.originAddress,
    ownerName: body.ownerName
  });

  return NextResponse.json(result);
}
