"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Building2, LogOut, Settings, Smartphone } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { InfoTooltip } from "@/components/info-tooltip";
import { CustomerWorkspaceKey, getCustomerNavigationGroups, getCustomerWorkspaceLabel } from "@/lib/customer-navigation";
import { normalizeWorkspaceRole, workspaceRoleLabels } from "@/lib/workspace";

type CustomerAppShellProps = {
  readonly active: CustomerWorkspaceKey;
  readonly children: ReactNode;
  readonly companyName: string;
  readonly fullBleed?: boolean;
  readonly hidePageTitle?: boolean;
  /** 제목 오른쪽(같은 줄)에 놓는 탭. 있으면 본문 위에 따로 탭 줄을 만들지 않는다. */
  readonly headerNav?: ReactNode;
  readonly mode?: "admin-preview" | "customer";
  readonly previewCompanyId?: string;
  readonly showHoldModules?: boolean;
  readonly rightAction?: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
  readonly userName?: string;
  readonly workspaceRole?: string;
};

// 11/3: 페이지 이동마다 메뉴(주문·단가 묶음)가 사라졌다 다시 나타나던 깜빡임 방지 — 마지막 응답을 탭 메모리에 둡니다.
type ShellMe = { companyName?: string; features: { pricing: boolean; storeOrdering: boolean }; role?: string; scope: string };
let shellMeMemory: ShellMe | null = null;

export function CustomerAppShell({ active, children, companyName, fullBleed = false, headerNav, hidePageTitle = false, mode = "customer", previewCompanyId, rightAction, showHoldModules = false, subtitle, title, userName, workspaceRole }: CustomerAppShellProps) {
  const cached = mode === "customer" ? shellMeMemory : null;
  const [resolvedWorkspaceRole, setResolvedWorkspaceRole] = useState(cached?.role || workspaceRole);
  const [features, setFeatures] = useState(cached?.features || { pricing: false, storeOrdering: false });
  const [sidebarScope, setSidebarScope] = useState(cached?.scope || "");
  const [liveCompanyName, setLiveCompanyName] = useState(cached?.companyName || companyName);
  const normalizedRole = normalizeWorkspaceRole(resolvedWorkspaceRole);
  const roleLabel = workspaceRoleLabels[normalizedRole];
  const compactMapHome = fullBleed && hidePageTitle;

  useEffect(() => {
    if (mode !== "customer") return;
    let mounted = true;
    fetch("/api/customer/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!mounted || !payload) return;
        const next: ShellMe = {
          companyName: payload.companyName || undefined,
          features: { pricing: payload.features?.pricing === true, storeOrdering: payload.features?.storeOrdering === true },
          role: payload.session?.workspaceRole,
          scope: payload.session?.companyId && (payload.session.userId || payload.session.email) ? `${payload.session.companyId}:${payload.session.userId || payload.session.email}` : ""
        };
        shellMeMemory = next;
        if (next.role) setResolvedWorkspaceRole(next.role);
        if (next.scope) setSidebarScope(next.scope);
        if (next.companyName) setLiveCompanyName(next.companyName);
        setFeatures(next.features);
      })
      .catch(() => null);
    return () => { mounted = false; };
  }, [mode]);

  return (
    <main className={`maju-app-bg min-h-screen text-slate-950 ${fullBleed ? "xl:h-dvh xl:overflow-y-auto" : ""}`}>
      <div className={`flex min-h-screen flex-col ${fullBleed ? "xl:h-full" : ""} lg:flex-row`}>
        <AppSidebar active={active} brand="MAJU" context="" groups={getCustomerNavigationGroups(showHoldModules, normalizedRole, features.pricing, features.storeOrdering)} homeHref="/dashboard" previewCompanyId={mode === "admin-preview" ? previewCompanyId : undefined} storageScope={sidebarScope} renderFooter={(collapsed) => (
          <div className={collapsed ? "flex flex-col items-center gap-2" : "flex items-center justify-between gap-2"}>
            {/* 11/3: 회사명은 맨 아래 — 회사명 / 로그인한 사람 · 직책. 접었을 때는 로그아웃만. */}
            {!collapsed ? <div className="min-w-0"><p className="truncate text-sm font-bold text-white">{liveCompanyName || "회사"}</p><p className="truncate text-[11px] font-semibold text-white/60">{userName || "로그인 사용자"} · {roleLabel}</p></div> : null}
            {mode === "customer" ? <div className="flex shrink-0 items-center gap-1"><Link aria-label="설정" className="grid h-8 w-8 place-items-center rounded-md text-white/60 transition hover:bg-white/10 hover:text-white" href="/dashboard/settings/company" title="설정"><Settings className="h-4 w-4" /></Link>{!collapsed ? <Link aria-label="작업공간 전환" className="grid h-8 w-8 place-items-center rounded-md text-white/60 transition hover:bg-white/10 hover:text-white" href="/workspaces" title="작업공간 전환"><Building2 className="h-4 w-4" /></Link> : null}<CustomerAccountActions compact={collapsed} sidebar /></div> : null}
          </div>
        )} variant="customer" />

        <section className={`min-w-0 flex-1 ${fullBleed ? "xl:flex xl:h-full xl:min-h-0 xl:flex-col" : ""}`}>
          <header className={`${compactMapHome ? "hidden" : "sticky top-0 z-20"} shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur ${fullBleed ? "xl:static" : ""}`}>
            <div className={`flex flex-col gap-3 px-4 sm:px-4 xl:flex-row xl:h-14 xl:items-center xl:justify-between xl:py-0 ${hidePageTitle ? "py-2" : "py-3"}`}>
              {/* 11/4: '지도 OS'·직책 배지는 왼쪽 맨 아래(회사명 / 이름 · 직책)와 겹쳐 뺐습니다. */}{!hidePageTitle ? <div className="min-w-0"><div className="flex min-w-0 items-center gap-1.5"><h1 className="truncate text-base font-bold tracking-[-0.02em] text-slate-950 sm:text-xl">{title}</h1>{subtitle ? <InfoTooltip text={subtitle} /> : null}</div></div> : <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2"><span className="text-sm font-semibold text-slate-900">{getCustomerWorkspaceLabel(active)}</span></div>}{headerNav ? <div className="min-w-0 flex-1 overflow-x-auto xl:px-4 [&_nav]:border-b-0">{headerNav}</div> : null}
              <div className={`flex max-w-full flex-wrap items-center gap-1.5 sm:gap-2 ${hidePageTitle ? "justify-start sm:justify-end xl:w-auto" : ""}`}>{mode === "customer" ? <Link className="maju-button-secondary h-8 shrink-0 px-2.5 text-xs shadow-none" href="/mobile/today" title="기사 화면 열기"><Smartphone className="h-4 w-4" /><span className="hidden xl:inline">기사 화면</span></Link> : null}{rightAction}</div>
            </div>
          </header>

          {mode === "admin-preview" ? <div className={`border-b border-amber-200 bg-amber-50/80 px-4 py-2.5 sm:px-4 ${fullBleed ? "shrink-0" : ""}`}><div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><p className="text-xs font-black text-amber-900">관리자 미리보기 모드</p><p className="mt-0.5 text-xs font-bold leading-5 text-amber-800">현재 화면은 고객사 운영 화면을 관리자 권한으로 확인하는 모드입니다. 계정, 권한, 고객사 생성·수정은 어드민에서 관리하세요.</p></div><div className="flex flex-wrap gap-2"><Link className="inline-flex min-h-11 items-center justify-center rounded-md bg-amber-900 px-3 text-xs font-black text-white transition hover:bg-amber-950" href="/admin/companies">고객사 관리로 돌아가기</Link><Link className="inline-flex min-h-11 items-center justify-center rounded-md border border-amber-200 bg-white px-3 text-xs font-black text-amber-900 transition hover:bg-amber-100" href="/admin">관리자 홈</Link></div></div></div> : null}
          <div className={fullBleed ? "flex w-full flex-col px-3 py-2 sm:px-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:py-2" : "w-full px-4 py-4 sm:px-5 lg:px-6 lg:py-5 xl:px-8"}>{children}</div>
        </section>
      </div>
    </main>
  );
}

function CustomerAccountActions({ compact = false, sidebar = false }: { readonly compact?: boolean; readonly sidebar?: boolean }) {
  async function logout() { await fetch("/api/customer/logout", { method: "POST" }); window.location.href = "/dashboard/login"; }
  return <button aria-label="로그아웃" className={`${sidebar ? "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border border-white/15 px-2 text-xs font-bold text-white/70 transition hover:bg-white/10 hover:text-white" : "maju-button-secondary h-8 shrink-0 px-2.5 text-xs shadow-none hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"} ${compact ? "w-9 px-0" : ""}`} onClick={logout} title="로그아웃" type="button"><LogOut className="h-4 w-4" /><span className={compact ? "sr-only" : sidebar ? "" : "hidden 2xl:inline"}>로그아웃</span></button>;
}
