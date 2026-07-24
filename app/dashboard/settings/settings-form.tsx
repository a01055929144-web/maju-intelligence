"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { FormEvent, useState } from "react";
import { Building2, Check, ClipboardCheck, Database, MapPin, Route, Save, Truck, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompanySettings } from "@/lib/store";

export function CompanySettingsForm({ initial }: { initial: CompanySettings }) {
  const [form, setForm] = useState({
    businessType: initial.businessType,
    name: initial.name,
    originAddress: initial.originAddress,
    ownerName: initial.ownerName
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
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

    setLoading(false);
    setMessage(response.ok ? "회사 설정이 저장됐습니다." : "저장에 실패했습니다. 값을 다시 확인해주세요.");
  }

  return (
    <form className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]" onSubmit={handleSubmit}>
      <div className="space-y-5">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div>
              <p className="text-sm font-black text-slate-950">운영 기준값 상태</p>
              <p className="mt-1 text-xs font-bold text-slate-500">지도, 배송코스, 거래처 히스토리에서 공통으로 사용하는 회사 기준입니다.</p>
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

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <Badge className="mb-3 w-fit bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">
              <Building2 className="mr-1 h-3.5 w-3.5" />
              회사 설정
            </Badge>
            <h2 className="text-2xl font-black text-slate-950">관리자가 생성한 회사 정보를 수정합니다</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              회사 계정과 최초 회사 등록은 MAJU 관리자가 생성합니다. 고객사는 운영에 필요한 기준값만 설정에서 수정합니다.
            </p>
          </div>
          <div className="space-y-4 p-5">
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
            {message ? (
              <p className={`rounded-md px-3 py-2 text-sm font-bold ${message.includes("실패") ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{message}</p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold leading-5 text-slate-500">저장 후 대시보드, 영업·배송 코스, 거래처 히스토리에서 같은 출발지 기준으로 계산됩니다.</p>
              <Button className="shrink-0" disabled={loading}>
                {loading ? <Check className="h-4 w-4 animate-pulse" /> : <Save className="h-4 w-4" />}
                설정 저장
              </Button>
            </div>
          </div>
        </section>
      </div>

      <aside className="h-fit overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-950">
            <MapPin className="h-5 w-5 text-primary" />
            운영 기준값
          </h2>
          <div className="rounded-lg border border-teal-100 bg-teal-50/70 p-3">
            <p className="text-xs font-black text-primary">현재 출발지</p>
            <p className="mt-1 text-sm font-black text-foreground">{hasOrigin ? form.originAddress : "출발지 주소를 입력해주세요"}</p>
          </div>
        </div>
        <div className="space-y-4 p-5 text-sm leading-6 text-muted-foreground">
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
            <QuickLink href="/routes/today" label="영업·배송 코스 보기" />
            <QuickLink href="/crm/timeline" label="거래처 히스토리 보기" />
            <QuickLink href="/" label="데이터 등록으로 이동" />
          </div>
          <p className="text-xs">마지막 수정: {initial.updatedAt}</p>
        </div>
      </aside>
    </form>
  );
}

function OperationSignal({ icon, label, ok, value }: { icon: ReactNode; label: string; ok: boolean; value: string }) {
  return (
    <div className="border-b border-slate-200 p-5 md:border-b-0 md:border-r last:md:border-r-0">
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
    <Link className="inline-flex h-10 items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-sm font-black text-foreground transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800" href={href}>
      {label}
      <Route className="h-4 w-4 text-primary" />
    </Link>
  );
}
