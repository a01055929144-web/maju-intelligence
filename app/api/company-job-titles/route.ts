import { NextRequest, NextResponse } from "next/server";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { addCompanyJobTitle, getCompanyJobTitles, removeCompanyJobTitle } from "@/lib/store";

export const dynamic = "force-dynamic";

async function requireMemberManager() {
  const session = await getCustomerSession();
  if (!session) return { response: NextResponse.json({ message: "Unauthorized" }, { status: 401 }), session: null };
  return { response: null, session };
}

export async function GET() {
  const { response, session } = await requireMemberManager();
  if (response || !session) return response;

  return NextResponse.json(await getCompanyJobTitles(session.companyId));
}

export async function POST(request: NextRequest) {
  const { response, session } = await requireMemberManager();
  if (response || !session) return response;
  if (!customerHasCapability(session, "manage_members")) {
    return NextResponse.json({ message: "담당 업무 항목을 추가할 권한이 없습니다. 대표/관리자에게 요청하세요." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { label?: string } | null;
  if (!body?.label?.trim()) {
    return NextResponse.json({ message: "담당 업무 이름을 입력하세요." }, { status: 400 });
  }

  try {
    const result = await addCompanyJobTitle(session.companyId, body.label, {
      actorName: session.name,
      actorRole: session.workspaceRole
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "추가에 실패했습니다." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const { response, session } = await requireMemberManager();
  if (response || !session) return response;
  if (!customerHasCapability(session, "manage_members")) {
    return NextResponse.json({ message: "담당 업무 항목을 삭제할 권한이 없습니다. 대표/관리자에게 요청하세요." }, { status: 403 });
  }

  const jobTitleId = request.nextUrl.searchParams.get("id") || "";
  if (!jobTitleId) {
    return NextResponse.json({ message: "삭제할 항목 ID가 필요합니다." }, { status: 400 });
  }

  try {
    await removeCompanyJobTitle(session.companyId, jobTitleId, {
      actorName: session.name,
      actorRole: session.workspaceRole
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "삭제에 실패했습니다." }, { status: 400 });
  }
}
