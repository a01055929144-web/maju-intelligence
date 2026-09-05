// 2026-08-26: 비밀번호 찾기(P1)를 위한 최소 이메일 발송 모듈입니다. Resend의 HTTP API를 fetch로
// 직접 호출해 별도 SDK 의존성을 추가하지 않습니다(이 저장소가 카카오/네이버/구글 로그인에서 쓰는
// 것과 같은 패턴). RESEND_API_KEY가 설정되어 있지 않으면 실제로 메일을 보내지 않고, 서버 로그에만
// 경고를 남긴 뒤 { ok: false, reason: "not_configured" }를 돌려줍니다 — 호출부(비밀번호 찾기 API)는
// 이 경우에도 사용자에게는 항상 동일한 안내 문구를 보여줘야 합니다(가입 여부가 새어나가지 않도록).

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export type SendEmailResult = {
  ok: boolean;
  reason?: "not_configured" | "send_failed" | "request_error";
};

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "MAJU Intelligence <onboarding@resend.dev>";

  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY가 설정되지 않아 메일을 보내지 않았습니다: "${input.subject}" -> ${input.to}`);
    return { ok: false, reason: "not_configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html
      })
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      console.error("[email] Resend 발송 실패:", response.status, message);
      return { ok: false, reason: "send_failed" };
    }

    return { ok: true };
  } catch (error) {
    console.error("[email] Resend 요청 중 오류:", error);
    return { ok: false, reason: "request_error" };
  }
}
