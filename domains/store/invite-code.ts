// 매장 초대코드 형식 규칙(순수 함수). 해시·저장은 서버(app/api/store-invite-codes)가 한다.
// 읽고 불러 주기 쉬운 8자: 헷갈리는 0/O, 1/I/L은 쓰지 않는다.
export const INVITE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const INVITE_CODE_LENGTH = 8;
export const INVITE_CODE_EXPIRY_DAYS = [7, 30, 90, 365] as const;

/** 무작위 바이트로 코드를 만든다. 256 % 31 편향을 피하려고 248 이상 바이트는 버린다. */
export function inviteCodeFromBytes(bytes: Uint8Array): string | null {
  let code = "";
  for (const byte of Array.from(bytes)) {
    if (byte >= 248) continue;
    code += INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length];
    if (code.length === INVITE_CODE_LENGTH) return code;
  }
  return null;
}

/** 매장이 입력한 값: 공백·하이픈 제거, 대문자. 형식이 맞지 않으면 null. */
export function normalizeInviteCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, "").toUpperCase();
  return code.length === INVITE_CODE_LENGTH && code.split("").every((char) => INVITE_CODE_ALPHABET.includes(char)) ? code : null;
}

/** 화면 표시용 4-4 묶음. */
export function formatInviteCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export type InviteCodeStatus = "active" | "expired" | "revoked";
export function inviteCodeStatus(code: { expiresAt: string; revokedAt: string | null }, now = Date.now()): InviteCodeStatus {
  if (code.revokedAt) return "revoked";
  return Date.parse(code.expiresAt) <= now ? "expired" : "active";
}
