import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { sendCustomerDeliveryMessage } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | {
        attachmentId?: string;
        channel?: "alimtalk" | "kakao" | "sms";
        companyId?: string;
        customerId?: string;
        message?: string;
        noteId?: string;
        triggerType?: "delivery_complete" | "delivery_issue" | "manual";
      }
    | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!body?.customerId) {
    return NextResponse.json({ message: "customerId는 필수입니다." }, { status: 400 });
  }

  if (!body.message?.trim()) {
    return NextResponse.json({ message: "발송할 메시지가 없습니다." }, { status: 400 });
  }

  try {
    const result = await sendCustomerDeliveryMessage(
      {
        attachmentId: body.attachmentId,
        channel: body.channel || "sms",
        customerId: body.customerId,
        message: body.message,
        noteId: body.noteId,
        triggerType: body.triggerType || "delivery_complete",
        triggeredByName: scope.customerSession?.name || scope.adminSession?.name
      },
      scope.companyId
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "메시지 발송 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
