export const LOGIN_ID_PATTERN = /^[a-z0-9_]{4,20}$/;
export const MIN_ACCOUNT_PASSWORD_LENGTH = 10;

export function normalizeLoginId(value: string) {
  return value.trim().toLowerCase();
}

export function isValidLoginId(value: string) {
  return LOGIN_ID_PATTERN.test(normalizeLoginId(value));
}

export function validateAccountPassword(value: string) {
  return value.length >= MIN_ACCOUNT_PASSWORD_LENGTH;
}
