import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, getCustomerSession } from "@/lib/auth";
import { addCustomerAttachment, addCustomerNote, getCustomerOperations } from "@/lib/store";

export const dynamic = "force-dynamic";

function getSession() {
  const customerSession = getCustomerSession();
  const adminSession = getAdminSession();
  return { adminSession, customerSession };
}

export async function GET(request: NextRequest) {
  const { adminSession, customerSession } = getSession();
  if (!customerSession && !adminSession) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const customerId = request.nextUrl.searchParams.get("customerId");
  if (!customerId) {
    return NextResponse.json({ message: "customerId는 필수입니다." }, { status: 400 });
  }

  const result = await getCustomerOperations(customerId, customerSession?.companyId);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const { adminSession, customerSession } = getSession();
  if (!customerSession && !adminSession) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

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
      }
    | null;

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
        createdByName: customerSession?.name || adminSession?.name
      },
      customerSession?.companyId
    );
    return NextResponse.json(result);
  }

  const result = await addCustomerNote(
    {
      customerId: body.customerId,
      memo: body.memo || "",
      nextAction: body.nextAction,
      noteType: body.noteType || "general",
      createdByName: customerSession?.name || adminSession?.name
    },
    customerSession?.companyId
  );
  return NextResponse.json(result);
}
