"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { FormEvent, useState } from "react";
import { Bell, Building2, Check, ClipboardCheck, Database, FileSpreadsheet, MapPin, Route, Save, SendHorizonal, Truck, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompanySettings } from "@/lib/store";

export function CompanySettingsForm({ initial }: { initial: CompanySettings }) {
  const [form, setForm] = useState({
    businessType: initial.businessType,
    name: initial.name,
    originAddress: initial.originAddress,
    ownerName: initial.ownerName,
    telegramChatId: initial.telegramChatId || ""
  });
  const [message, setMessage] = useState("");
  const [messageOk, setMessageOk] = useState(true);
  const [loading, setLoading] = useState(false);
  const [telegramTestMessage, setTelegramTestMessage] = useState("");
  const [telegramTesting, setTelegramTesting] = useState(false);
  const hasOrigin = Boolean(form.originAddress.trim());
  const hasCompanyName = Boolean(form.name.trim());
  const completedItems = [hasCompanyName, hasOrigin, Boolean(form.ownerName.trim())].filter(Boolean).length;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const response = await fetch("/api/customer/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const payload = await response.json().catch(() => null);

    setLoading(false);
    setMessageOk(response.ok);
    setMessage(response.ok ? "회사 설정이 저장됐습니다." : payload?.error || "저장에 실패했습니다. 값을 다시 확인해주세요.");
  }

  async function handleTelegramTest() {
    setTelegramTesting(true);
    setTelegramTestMessage("");

    const response = await fetch("/api/customer/telegram-test", { method: "POST" });
    const payload = await response.json().catch(() => null);

    setTelegramTesting(false);
    setTelegramTestMessage(response.ok ? "테스트 메시지를 보냈습니다. 텔레그램 그룹을 확인하세요." : payload?.message || "테스트 발송에 실패했습니다.");
  }

  return (
    <form className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]" onSubmit={handleSubmit}>
      <div className="space-y-5">
        <section className="maju-section-card">
          <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="maju-section-title">운영 기준값 상태</p>
              <p className="mt-1 maju-muted-label normal-case tracking-normal">지도, 배송코스, 거래처 히스토리에서 공통으로 사용하는 회사 기준입니다.</p>
            </div>
            <Badge className={completedItems >= 3 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
              {completedItems}/3 완료
            </Badge>
          </div>
          <div className="grid md:grid-cols-3">
            <OperationSignal
              icon={<Building2 className="h-4 w-4" />}
              label="회사 기준값"
              ok={hasCompanyName}
              value={hasCompanyName ? "설정됨" : "확인 필요"}
            />
            <OperationSignal
              icon={<MapPin className="h-4 w-4" />}
              label="물류 출발지"
              ok={hasOrigin}
              value={hasOrigin ? "거리 계산 가능" : "주소 필요"}
            />
            <OperationSignal
              icon={<ClipboardCheck className="h-4 w-4" />}
              label="운영 준비도"
              ok={completedItems >= 3}
              value={`${completedItems}/3 완료`}
            />
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <BasisCard
            icon={<FileSpreadsheet className="h-4 w-4" />}
            title="1. 기준정보 저장"
            description="회사명과 물류 출발지가 저장되어야 거래처 거리와 코스 계산 기준이 맞습니다."
          />
          <BasisCard
            icon={<Upload className="h-4 w-4" />}
            title="2. 거래처 데이터 연결"
            description="수기 등록 또는 엑셀 업로드 데이터가 같은 회사 기준으로 누적됩니다."
          />
          <BasisCard
            icon={<Truck className="h-4 w-4" />}
            title="3. 현장 화면 반영"
            description="지도 홈과 거래처 원장에서 동일한 기준값을 사용합니다."
          />
        </section>

        <section className="maju-section-card">
          <div className="maju-card-header">
            <Badge className="mb-3 w-fit bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">
              <Building2 className="mr-1 h-3.5 w-3.5" />
              회사 설정
            </Badge>
            <h2 className="text-2xl font-black text-slate-950">관리자가 생성한 회사 정보를 수정합니다</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              회사 계정과 최초 회사 등록은 MAJU 관리자가 생성합니다. 고객사는 운영에 필요한 기준값만 설정에서 수정합니다.
            </p>
          </div>
          <div className="space-y-4 p-4">
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-muted-foreground">회사명</span>
              <input
                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-muted-foreground">대표자/담당자</span>
                <input
                  className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                  value={form.ownerName}
                  onChange={(event) => setForm({ ...form, ownerName: event.target.value })}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-muted-foreground">업태/업종</span>
                <input
                  className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                  value={form.businessType}
                  onChange={(event) => setForm({ ...form, businessType: event.target.value })}
                />
              </label>
            </div>
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-muted-foreground">물류 출발지 주소</span>
              <input
                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                value={form.originAddress}
                onChange={(event) => setForm({ ...form, originAddress: event.target.value })}
                placeholder="예: 경기도 하남시 초이로 133 1층"
              />
            </label>
            <label className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                <Bell className="h-3.5 w-3.5" />
                이탈 위험 알림 · 텔레그램 그룹 chat_id
              </span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                  value={form.telegramChatId}
                  onChange={(event) => setForm({ ...form, telegramChatId: event.target.value })}
                  placeholder="예: -1001234567890"
                />
                <Button
                  className="shrink-0"
                  disabled={!form.telegramChatId.trim() || telegramTesting}
                  onClick={handleTelegramTest}
                  type="button"
                  variant="outline"
                >
                  <SendHorizonal className="h-4 w-4" />
                  {telegramTesting ? "발송 중..." : "테스트 발송"}
                </Button>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-500">
                <p>21일 이상 매출 없는 거래처가 있으면 매일 이 텔레그램 그룹으로 알림을 보냅니다. 설정 방법:</p>
                <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                  <li>알림 받을 텔레그램 그룹을 만들고, MAJU 담당자에게 안내받은 봇을 그 그룹에 초대합니다.</li>
                  <li>그룹 chat_id를 확인합니다 — 그룹에 아무 메시지나 보낸 뒤, 브라우저에서 <code className="rounded bg-white px-1 py-0.5">https://api.telegram.org/bot(봇 토큰)/getUpdates</code>에 접속하면 <code className="rounded bg-white px-1 py-0.5">chat.id</code> 값(그룹은 보통 -로 시작하는 숫자)을 확인할 수 있습니다. 봇 토큰은 MAJU 담당자에게 문의하세요.</li>
                  <li>위 입력칸에 chat_id를 저장한 뒤 "테스트 발송"으로 실제 도착을 확인합니다.</li>
                </ol>
                <p className="mt-1.5 text-amber-700">그룹에서 봇이 제외되거나 chat_id가 바뀌면 알림이 조용히 끊깁니다 — 주기적으로 테스트 발송으로 확인해주세요.</p>
              </div>
              {telegramTestMessage ? (
                <p className={`text-xs font-bold ${telegramTestMessage.includes("실패") || telegramTestMessage.includes("먼저") ? "text-rose-600" : "text-emerald-700"}`}>
                  {telegramTestMessage}
                </p>
              ) : null}
            </label>
            {message ? (
              <p className={`rounded-md px-3 py-2 text-sm font-bold ${messageOk ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{message}</p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold leading-5 text-slate-500">저장 후 지도 홈과 거래처 원장에서 같은 출발지 기준으로 계산됩니다.</p>
              <Button className="shrink-0" disabled={loading}>
                {loading ? <Check className="h-4 w-4 animate-pulse" /> : <Save className="h-4 w-4" />}
                설정 저장
              </Button>
            </div>
          </div>
        </section>
      </div>

      <aside className="h-fit maju-section-card">
        <div className="maju-card-header space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-950">
            <MapPin className="h-5 w-5 text-primary" />
            운영 기준값
          </h2>
          <div className="rounded-lg border border-teal-100 bg-teal-50/70 p-3">
            <p className="text-xs font-black text-primary">현재 출발지</p>
            <p className="mt-1 text-sm font-black text-foreground">{hasOrigin ? form.originAddress : "출발지 주소를 입력해주세요"}</p>
          </div>
        </div>
        <div className="space-y-4 p-4 text-sm leading-6 text-muted-foreground">
          <WorkflowItem
            icon={<Database className="h-4 w-4" />}
            title="고객사 계정"
            description="관리자가 회사 ID와 로그인 계정을 생성하면 고객사 데이터가 회사별로 분리됩니다."
          />
          <WorkflowItem
            icon={<Upload className="h-4 w-4" />}
            title="거래처 등록"
            description="수기 등록 또는 엑셀 업로드로 매장 기본정보, 사업자번호, 배송주소를 저장합니다."
          />
          <WorkflowItem
            icon={<Truck className="h-4 w-4" />}
            title="배송 기준"
            description="물류 출발지는 모든 거래처 거리, 차량별 경유 코스, 티맵 계산의 기준점입니다."
          />
          <div className="grid gap-2 pt-1">
            <QuickLink href="/dashboard" label="지도 홈 보기" />
            <QuickLink href="/crm/timeline" label="거래처 히스토리 보기" />
            <QuickLink href="/" label="거래처 관리 · 등록으로 이동" />
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-4">
            <p className="font-black text-blue-950">저장 후 확인 순서</p>
            <ol className="mt-2 space-y-2 text-xs font-bold leading-5 text-blue-900">
              <li>1. 출발지 주소 저장 상태 확인</li>
              <li>2. 거래처 등록 화면에서 배송주소 데이터 확인</li>
              <li>3. 지도 홈에서 출발지-매장 거리 확인</li>
            </ol>
          </div>
          <p className="text-xs">마지막 수정: {initial.updatedAt}</p>
        </div>
      </aside>
    </form>
  );
}

function BasisCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="maju-stat-card p-4">
      <div className="flex items-center gap-2 text-sm font-black text-slate-950">
        <span className="text-teal-700">{icon}</span>
        {title}
      </div>
      <p className="mt-2 text-xs font-bold leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function OperationSignal({ icon, label, ok, value }: { icon: ReactNode; label: string; ok: boolean; value: string }) {
  return (
    <div className="border-b border-slate-200 p-4 md:border-b-0 md:border-r last:md:border-r-0">
      <div className={ok ? "text-teal-700" : "text-amber-600"}>{icon}</div>
      <p className="mt-3 text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-black text-foreground">{value}</p>
    </div>
  );
}

function WorkflowItem({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 font-black text-foreground">
        <span className="text-primary">{icon}</span>
        {title}
      </div>
      <p className="mt-1">{description}</p>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="inline-flex min-h-11 items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-sm font-black text-foreground transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800" href={href}>
      {label}
      <Route className="h-4 w-4 text-primary" />
    </Link>
  );
}
