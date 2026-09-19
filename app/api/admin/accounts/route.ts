import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { getAuthCredentials, upsertAuthCredentials } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const credentials = await getAuthCredentials();
  return NextResponse.json({ credentials: publicCredentials(credentials) });
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        adminEmail?: string;
        adminPassword?: string;
        customerCompanyId?: string;
        customerEmail?: string;
        customerPassword?: string;
      }
    | null;

  if (!body?.adminEmail || !body.customerEmail) {
    return NextResponse.json({ message: "관리자/고객사 이메일은 필수입니다." }, { status: 400 });
  }

  const result = await upsertAuthCredentials(body, {
    actorName: session.name,
    actorRole: session.appRole
  });
  return NextResponse.json({ ...result, credentials: publicCredentials(result.credentials) });
}

function publicCredentials(credentials: Awaited<ReturnType<typeof getAuthCredentials>>) {
  return {
    adminEmail: credentials.adminEmail,
    adminPassword: "",
    customerEmail: credentials.customerEmail,
    customerPassword: "",
    customerCompanyId: credentials.customerCompanyId,
    updatedAt: credentials.updatedAt
  };
}
