/** 직접 가입은 전역 스위치(기본 OFF). 회사별 목록은 쓰지 않는다 — 가입은 아직 어느 유통사에도 속하지 않는다. 의존성 없는 파일로 둔다(여러 라우트·테스트가 가볍게 가져온다). */
export function storeDirectSignupEnabled() {
  return process.env.STORE_DIRECT_SIGNUP_ENABLED === "true";
}
