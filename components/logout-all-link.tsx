"use client";

// CC-39: 로그아웃은 자기 사이트만 해제하므로, 공용 PC에서는 이 링크로 관리자·운영·매장 로그인을 한 번에 해제한다.
export function LogoutAllLink({ className = "", to }: { readonly className?: string; readonly to: string }) {
  async function logoutAll() {
    await fetch("/api/auth/logout-all", { method: "POST" });
    window.location.href = to;
  }
  return <button className={`text-xs font-bold text-slate-500 underline hover:text-slate-800 ${className}`} onClick={logoutAll} type="button">이 브라우저의 모든 MAJU 로그인 해제</button>;
}
