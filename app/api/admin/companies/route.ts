import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { getManagedCompanyAccounts, ManagedCompanyAccountInput, upsertManagedCompanyAccount } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await getManagedCompanyAccounts());
}

export async function POST(request: NextRequest) {
  const session = requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as ManagedCompanyAccountInput | null;
  if (!body?.name || !body.customerEmail || !body.customerPassword) {
    return NextResponse.json({ message: "고객사명, 로그인 이메일, 비밀번호는 필수입니다." }, { status: 400 });
  }

  try {
    return NextResponse.json(await upsertManagedCompanyAccount(body));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "고객사 저장에 실패했습니다." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  return POST(request);
}
