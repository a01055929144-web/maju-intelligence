"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

export type StoreKakaoLogin = { enabled: boolean; companyId?: string; storeAccountId?: string; errorCode?: string; message?: string };

function loginError(code: string) {
  if (code === "store_login_unavailable") return "매장 로그인은 아직 준비 중입니다. 담당자에게 이용 가능 여부를 확인해 주세요.";
  if (code === "store_membership_required") return "이 매장에 접근할 권한이 없습니다. 점주에게 전용 주소와 구성원 등록을 확인해 주세요.";
  if (code === "store_activation_required") return "점주 개통 링크가 없거나 만료되었습니다. 받은 개통 링크를 다시 열거나 담당자에게 새 링크를 요청해 주세요.";
  if (code === "business_status_verification_required") return "사업자 상태를 확인하지 못했습니다. 담당자에게 확인 후 다시 시도해 주세요.";
  return "카카오 로그인을 완료하지 못했습니다. 받은 매장 전용 주소에서 다시 시도해 주세요.";
}

export function StoreKakaoLoginPanel({ access, newWindow = false }: { access: StoreKakaoLogin; newWindow?: boolean }) {
  const scoped = Boolean(access.companyId && access.storeAccountId);
  return <Card>
    <CardHeader><CardTitle>매장 카카오 로그인</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      {access.errorCode && <p role="alert">{loginError(access.errorCode)}</p>}
      <p className="text-sm">점주·매장 구성원은 받은 전용 주소에서 카카오로 로그인해 주세요. 주문은 기존 주문 링크에서 이용할 수 있습니다.</p>
      {access.message ? <p role="status">{access.message}</p> : !access.enabled ? <p role="status">매장 로그인은 아직 준비 중입니다. 담당자의 안내 후 이용해 주세요.</p> :
        !scoped ? <p role="status">회사·매장이 지정된 전용 주소가 필요합니다. 받은 주소를 다시 열어 주세요.</p> : null}
      {newWindow && <p className="text-sm">새 탭에서 로그인한 뒤 이 주문 탭으로 돌아와 로그인 상태를 다시 확인해 주세요.</p>}
      {access.enabled && scoped ? <form action="/api/auth/kakao/start" method="get" target={newWindow ? "_blank" : undefined} rel={newWindow ? "noopener noreferrer" : undefined}>
        <input type="hidden" name="store" value="1" />
        <input type="hidden" name="companyId" value={access.companyId} />
        <input type="hidden" name="storeAccountId" value={access.storeAccountId} />
        <Button className="min-h-[44px]" type="submit">카카오로 매장 로그인</Button>
      </form> : <Button className="min-h-[44px]" disabled>카카오로 매장 로그인</Button>}
    </CardContent>
  </Card>;
}

export function StoreOwnerActivationPanel({ enabled }: { enabled: boolean }) {
  const token = useRef("");
  const publicFlow = useRef(false);
  const [ready, setReady] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState({ address: "", businessRegistrationNumber: "", phone: "", representativeName: "", storeName: "" });
  useEffect(() => {
    if (token.current) return;
    const value = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (/^[A-Za-z0-9_-]{43}$/.test(value) || /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
      token.current = value; publicFlow.current = value.includes("."); setReady(true);
    }
    else setError("개통 링크를 확인할 수 없습니다. 담당자에게 받은 전체 링크를 다시 열어 주세요.");
  }, []);
  useEffect(() => {
    const reopen = () => { if (window.location.hash) window.location.reload(); };
    window.addEventListener("hashchange", reopen);
    return () => window.removeEventListener("hashchange", reopen);
  }, []);
  async function start() {
    if (!enabled || !ready || !accepted || busy || !token.current) return;
    if (publicFlow.current && (!profile.storeName.trim() || !profile.representativeName.trim() ||
      profile.businessRegistrationNumber.replace(/\D/g, "").length !== 10 || !profile.address.trim() || profile.phone.replace(/\D/g, "").length < 9)) {
      setError("매장명, 대표자명, 사업자등록번호, 연락처와 주소를 모두 확인해 주세요."); return;
    }
    setBusy(true); setError("");
    try {
      const body = publicFlow.current
        ? { onboardingIntent: token.current, store: profile, termsAccepted: true }
        : { token: token.current, termsAccepted: true };
      const response = await fetch("/api/store/accounts/activate", { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) {
        throw new Error(response.status === 410 ? "개통 링크가 만료되었거나 사용되었습니다. 담당자에게 새 링크를 요청해 주세요." :
          response.status === 404 ? "점주 개통은 아직 준비 중입니다. 담당자에게 확인해 주세요." :
            response.status === 400 ? "개통 링크와 약관 동의를 확인한 뒤 다시 시도해 주세요." :
              response.status === 401 || response.status === 403 ? "개통 권한을 확인할 수 없습니다. 담당자에게 받은 링크를 확인해 주세요." : "개통 요청을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
      const result = await response.json() as { loginUrl: string };
      const url = new URL(result.loginUrl, window.location.origin);
      const allowed = ["store", "companyId", "storeAccountId", "activation"];
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (url.origin !== window.location.origin || url.pathname !== "/api/auth/kakao/start" || url.hash ||
        Array.from(url.searchParams.keys()).length !== 4 || Array.from(url.searchParams.keys()).some(key => !allowed.includes(key)) || url.searchParams.get("store") !== "1" ||
        url.searchParams.get("activation") !== "1" || !uuid.test(url.searchParams.get("companyId") || "") ||
        !uuid.test(url.searchParams.get("storeAccountId") || "")) throw new Error("로그인 주소를 확인하지 못했습니다. 담당자에게 다시 문의해 주세요.");
      token.current = "";
      window.location.assign(url.pathname + url.search);
    } catch (error) {
      setError(error instanceof TypeError ? "개통 요청을 확인하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요." :
        error instanceof Error ? error.message : "개통 요청을 확인하지 못했습니다. 다시 시도해 주세요.");
      setBusy(false);
    }
  }
  return <Card>
    <CardHeader><CardTitle>점주 계정 시작</CardTitle><p className="text-sm">담당자에게 받은 개통 링크에서 점주 본인이 동의하고 카카오 인증을 진행합니다.</p></CardHeader>
    <CardContent className="space-y-4">
      {!enabled && <p role="status">점주 개통은 아직 준비 중입니다. 담당자의 안내 후 원래 개통 링크를 다시 열어 주세요.</p>}
      {error && <p role="alert">{error}</p>}
      {publicFlow.current && ready && <fieldset className="space-y-3" disabled={!enabled || busy}>
        <legend className="font-medium">매장 정보</legend>
        {([["storeName", "매장명"], ["representativeName", "대표자명"], ["businessRegistrationNumber", "사업자등록번호"],
          ["phone", "연락처"], ["address", "매장 주소"]] as const).map(([key, label]) => <label className="block text-sm" key={key}>{label}
            <input className="mt-1 min-h-[44px] w-full rounded-md border px-3" value={profile[key]} autoComplete={key === "phone" ? "tel" : "organization"}
              inputMode={key === "phone" || key === "businessRegistrationNumber" ? "numeric" : "text"}
              onChange={event => setProfile(current => ({ ...current, [key]: event.target.value }))} /></label>)}</fieldset>}
      <p className="text-sm"><a className="underline" href="/legal/terms" target="_blank" rel="noreferrer noopener">이용약관</a>과 <a className="underline" href="/legal/privacy" target="_blank" rel="noreferrer noopener">개인정보처리방침</a>을 확인해 주세요.</p>
      <label className="flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={accepted} disabled={!enabled || !ready || busy}
        onChange={event => setAccepted(event.target.checked)} />이용약관과 개인정보처리방침을 확인하고 동의합니다.</label>
      <Button className="min-h-[44px]" disabled={!enabled || !ready || !accepted || busy} onClick={() => void start()}>{busy ? "개통 요청 확인 중" : "동의하고 카카오로 시작"}</Button>
      <p className="text-sm">개통·접근 권한과 사업자 상태는 인증 후 다시 확인합니다. 원가 기능은 별도 이용 안내 후 열립니다.</p>
    </CardContent>
  </Card>;
}
