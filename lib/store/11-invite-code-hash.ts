import { createHmac } from "crypto";

/** 8자 코드는 짧아 평문 SHA-256이면 해시 유출 시 대입으로 찾을 수 있다. 서버 비밀값으로 HMAC. 발급(CC-07)과 확인(CX-12)이 같은 구현을 쓴다. */
export function hashInviteCode(code: string) {
  const secret = process.env.STORE_LINK_SECRET;
  if (!secret || secret.length < 32) throw new Error("Store link secret is not configured.");
  return createHmac("sha256", secret).update(`store-invite-code.v1:${code}`).digest("hex");
}
