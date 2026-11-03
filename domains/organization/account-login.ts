export const LOGIN_ID_PATTERN = /^[a-z0-9_]{4,20}$/;
// 11/3 대표 결정: 4자리 허용. 대신 5회 실패 시 잠금(login_locked_until)과 로그인 시도 제한을 유지합니다.
export const MIN_ACCOUNT_PASSWORD_LENGTH = 4;

export function normalizeLoginId(value: string) {
  return value.trim().toLowerCase();
}

export function isValidLoginId(value: string) {
  return LOGIN_ID_PATTERN.test(normalizeLoginId(value));
}

export function validateAccountPassword(value: string) {
  return value.length >= MIN_ACCOUNT_PASSWORD_LENGTH;
}
