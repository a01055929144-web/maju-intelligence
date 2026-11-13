"use client";

// CC-39 선결 조건: 브라우저의 같은 사이트 /api 요청에 x-maju-site(admin·company·store)를 붙인다.
// 관리자·운영 로그인이 함께 있을 때 서버가 어느 화면의 요청인지 알 수 있게 하는 한 곳의 래퍼(화면별 fetch 수정 없음).
const siteOf = (pathname: string) => (pathname.startsWith("/admin") ? "admin" : pathname.startsWith("/store") ? "store" : "company");

function install() {
  const w = window as unknown as { __majuSiteFetch?: boolean };
  if (w.__majuSiteFetch) return;
  w.__majuSiteFetch = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
      if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        if (!headers.has("x-maju-site")) headers.set("x-maju-site", siteOf(window.location.pathname));
        return original(input, { ...init, headers });
      }
    } catch { /* 주소를 읽지 못하면 원래 요청 그대로 */ }
    return original(input, init);
  };
}
if (typeof window !== "undefined") install();

export function SiteFetchHeader() { return null; }
