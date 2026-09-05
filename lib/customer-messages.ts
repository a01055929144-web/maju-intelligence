import { createHmac } from "crypto";

export type CustomerMessageChannel = "alimtalk" | "kakao" | "sms";
export type CustomerMessageStatus = "failed" | "queued" | "sent";

export type CustomerMessageSendInput = {
  channel: CustomerMessageChannel;
  message: string;
  phone?: string;
};

export type CustomerMessageSendResult = {
  provider: "solapi" | "manual";
  providerMessageId?: string;
  recipientPhone?: string;
  reason?: string;
  status: CustomerMessageStatus;
};

export function isCustomerMessageProviderConfigured() {
  return Boolean(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SOLAPI_SENDER_PHONE);
}

export async function sendCustomerMessage(input: CustomerMessageSendInput): Promise<CustomerMessageSendResult> {
  const phone = normalizeKoreanPhone(input.phone);
  if (!phone) {
    return { provider: "manual", reason: "거래처 수신 연락처가 없어 수동 발송 대기 상태로 저장했습니다.", status: "queued" };
  }

  if (!isCustomerMessageProviderConfigured()) {
    return { provider: "manual", reason: "문자 발송 키가 설정되지 않아 무료 수동 발송으로 전환합니다.", recipientPhone: phone, status: "queued" };
  }

  if (input.channel === "kakao" || input.channel === "alimtalk") {
    return { provider: "manual", reason: "카카오 알림톡 템플릿 승인 전까지 무료 수동 발송으로 전환합니다.", recipientPhone: phone, status: "queued" };
  }

  return sendSolapiSms({ message: input.message, phone });
}

function normalizeKoreanPhone(value?: string) {
  const digits = (value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("82")) return digits;
  if (digits.startsWith("0")) return `82${digits.slice(1)}`;
  return digits;
}

async function sendSolapiSms({ message, phone }: { message: string; phone: string }): Promise<CustomerMessageSendResult> {
  const apiKey = process.env.SOLAPI_API_KEY || "";
  const apiSecret = process.env.SOLAPI_API_SECRET || "";
  const from = (process.env.SOLAPI_SENDER_PHONE || "").replace(/\D/g, "");
  const salt = Math.random().toString(36).slice(2);
  const date = new Date().toISOString();
  const signature = await createHmacSignature(apiSecret, date, salt);

  const response = await fetch("https://api.solapi.com/messages/v4/send", {
    method: "POST",
    headers: {
      Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: {
        from,
        text: message.slice(0, 2000),
        to: phone
      }
    })
  }).catch((error) => {
    throw new Error(error instanceof Error ? error.message : "문자 발송 요청에 실패했습니다.");
  });

  const payload = (await response.json().catch(() => null)) as { groupId?: string; messageId?: string; errorMessage?: string } | null;
  if (!response.ok) {
    return { provider: "solapi", reason: payload?.errorMessage || "문자 발송사 요청이 실패했습니다.", recipientPhone: phone, status: "failed" };
  }

  return {
    provider: "solapi",
    providerMessageId: payload?.messageId || payload?.groupId,
    recipientPhone: phone,
    status: "sent"
  };
}

async function createHmacSignature(secret: string, date: string, salt: string) {
  return createHmac("sha256", secret).update(date + salt).digest("hex");
}
