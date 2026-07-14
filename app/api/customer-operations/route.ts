import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { addCustomerAttachment, addCustomerNote, getCustomerOperations } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = getRequestAuthScope(request);
  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const customerId = request.nextUrl.searchParams.get("customerId");
  if (!customerId) {
    return NextResponse.json({ message: "customerId는 필수입니다." }, { status: 400 });
  }

  const result = await getCustomerOperations(customerId, scope.companyId);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        action?: "note" | "attachment";
        attachmentType?: string;
        customerId?: string;
        fileUrl?: string;
        memo?: string;
        mimeType?: string;
        nextAction?: string;
        noteType?: string;
        title?: string;
        companyId?: string;
      }
    | null;
  const scope = getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!body?.customerId) {
    return NextResponse.json({ message: "customerId는 필수입니다." }, { status: 400 });
  }

  if (body.action === "attachment") {
    const result = await addCustomerAttachment(
      {
        attachmentType: body.attachmentType || "etc",
        customerId: body.customerId,
        fileUrl: body.fileUrl,
        mimeType: body.mimeType,
        title: body.title || "첨부자료",
        createdByName: scope.customerSession?.name || scope.adminSession?.name
      },
      scope.companyId
    );
    return NextResponse.json(result);
  }

  const result = await addCustomerNote(
    {
      customerId: body.customerId,
      memo: body.memo || "",
      nextAction: body.nextAction,
      noteType: body.noteType || "general",
      createdByName: scope.customerSession?.name || scope.adminSession?.name
    },
    scope.companyId
  );
  return NextResponse.json(result);
}
