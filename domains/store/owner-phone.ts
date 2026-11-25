/** 점주 휴대폰 정규화(010xxxxxxxx). 카카오 "+82 10-1234-5678"과 입력값 "010-1234-5678"을 같은 값으로. 그 밖은 null. */
export function normalizeOwnerMobile(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/^\+82\s?/, "0").replace(/\D/g, "");
  return /^010\d{8}$/.test(digits) ? digits : null;
}

/** 로그·응답·화면에는 뒤 4자리만 쓴다. */
export function ownerMobileLast4(mobile: string) {
  return mobile.slice(-4);
}
