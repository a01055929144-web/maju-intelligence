/** 최근 로그인 방식(아이디/카카오)만 이 브라우저에 기억합니다. 아이디·이메일 값은 저장하지 않습니다. */
export type LastLoginMethod = "id" | "kakao";
const KEY = "maju_last_login_method";

export function rememberLoginMethod(method: LastLoginMethod) {
  try { window.localStorage.setItem(KEY, method); } catch { /* 저장 불가 브라우저는 무시 */ }
}

export function readLoginMethod(): LastLoginMethod | "" {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "id" || value === "kakao" ? value : "";
  } catch {
    return "";
  }
}
