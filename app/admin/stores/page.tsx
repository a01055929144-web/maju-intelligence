import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Building2, History, Store, Users } from "lucide-react";
import { AdminPageHeader } from "../admin-page-header";
import { StoreActivityList } from "@/components/store-activity-list";
import { AdminStoreConnectionActions } from "@/components/admin-store-connection-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminSession } from "@/lib/auth";
import { getAdminStoreDirectory } from "@/lib/admin-store-directory";
import { hasFeatureRollout } from "@/lib/feature-flags";

export default async function AdminStoresPage({ searchParams }: { searchParams: Promise<{ duplicate?: string; q?: string; storeId?: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!hasFeatureRollout("ADMIN_STORE_MANAGEMENT")) redirect("/admin");
  const params = await searchParams;
  const stores = await getAdminStoreDirectory().catch(() => null);
  const query = (params.q || "").trim().toLowerCase();
  const filtered = (stores || []).filter((store) => (!params.duplicate || store.duplicateSuspected)
    && (!query || [store.storeName, store.businessNumber, store.address, ...store.connections.flatMap((item) => [item.companyName, item.customerName])]
      .some((value) => value?.toLowerCase().includes(query))));
  const selected = filtered.find((store) => store.id === params.storeId) || filtered[0];

  return <main className="min-h-screen maju-app-bg">
    <AdminPageHeader active="stores" badge="CX-78 · 읽기 전용" session={session} subtitle="유통사별 연결을 넘어 같은 실제 매장을 한 곳에서 확인합니다" title="매장 관리" />
    <section className="mx-auto max-w-7xl space-y-4 px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="전체 매장" value={stores?.length || 0} />
        <Summary label="중복 의심" value={stores?.filter((store) => store.duplicateSuspected).length || 0} tone="warn" />
        <Summary label="유통사 연결" value={stores?.reduce((sum, store) => sum + store.connections.length, 0) || 0} />
      </div>
      <form className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_auto_auto]" method="get">
        <input aria-label="매장 검색" className="h-11 min-w-0 rounded-lg border border-slate-300 px-3 text-sm" defaultValue={params.q} name="q" placeholder="매장명, 사업자번호, 주소, 유통사 검색" />
        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold"><input defaultChecked={params.duplicate === "1"} name="duplicate" type="checkbox" value="1" />중복 의심만</label>
        <button className="min-h-11 rounded-lg bg-slate-950 px-4 text-sm font-black text-white" type="submit">조회</button>
      </form>
      {!stores ? <Notice kind="error" text="매장 목록 조회에 실패했습니다. 0건과 구분해 표시합니다." /> : null}
      {stores && !filtered.length ? <Notice kind="status" text="조건에 맞는 매장이 없습니다." /> : null}
      {selected ? <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.6fr)]">
        <div className="space-y-2">
          {filtered.map((store) => <Link aria-current={selected.id === store.id ? "page" : undefined} className={`block rounded-xl border p-3 ${selected.id === store.id ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-white"}`} href={href(params, store.id)} key={store.id}>
            <div className="flex min-w-0 items-start justify-between gap-2"><p className="min-w-0 break-words text-sm font-black text-slate-950">{store.storeName}</p>{store.duplicateSuspected ? <Badge className="shrink-0 bg-rose-100 text-rose-800">중복 의심</Badge> : null}</div>
            <p className="mt-1 break-words text-xs font-semibold text-slate-600">{store.address || "주소 미입력"}</p>
            <p className="mt-2 text-xs font-bold text-slate-500">유통사 {store.connections.length} · 사람 {store.members.length} · {statusLabel(store.status)}</p>
          </Link>)}
        </div>
        <StoreDetail store={selected} />
      </div> : null}
    </section>
  </main>;
}

function StoreDetail({ store }: { store: Awaited<ReturnType<typeof getAdminStoreDirectory>>[number] }) {
  return <div className="min-w-0 space-y-4">
    <Card><CardHeader><div className="flex flex-wrap items-center gap-2"><CardTitle className="break-words">{store.storeName}</CardTitle><Badge>{statusLabel(store.status)}</Badge>{store.duplicateSuspected ? <Badge className="bg-rose-100 text-rose-800">중복 확인 필요</Badge> : null}</div></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-2">
      <Info label="사업자번호" value={formatBusinessNumber(store.businessNumber)} /><Info label="영업 상태" value={statusLabel(store.businessStatus)} />
      <Info label="주소" value={store.address || "미입력"} /><Info label="가입 경로" value={originLabel(store.origin)} />
    </CardContent></Card>
    <Section icon={Building2} title={`연결 유통사 ${store.connections.length}`} empty="연결된 유통사가 없습니다.">{store.connections.map((item) => <div className="min-w-0 space-y-2" key={item.id}><Row title={item.companyName} text={`${item.customerName} · ${statusLabel(item.status)}${item.reviewStatus === "needs_review" ? " · 매출처 확인 필요" : ""}`} /><StoreActivityList companyId={item.companyId} storeAccountId={item.id} /><AdminStoreConnectionActions companyId={item.companyId} storeAccountId={item.id} /></div>)}</Section>
    <Section icon={Users} title={`사람 ${store.members.length}`} empty="연결된 사람이 없습니다.">{store.members.map((item) => <Row key={item.id} title={`${item.name} · ${roleLabel(item.role)}`} text={[item.phone, item.email, statusLabel(item.status)].filter(Boolean).join(" · ")} />)}</Section>
    <Section icon={History} title={`변경 기록 ${store.changes.length}`} empty="기록된 변경이 없습니다.">{store.changes.slice(0, 20).map((item) => <Row key={item.id} title={item.fields.map(fieldLabel).join(", ") || "매장 정보 변경"} text={`${item.actorName} · ${formatDate(item.createdAt)}`} />)}</Section>
    <p className="rounded-lg bg-slate-100 p-3 text-xs font-bold leading-5 text-slate-600">사업자 재확인과 멈추기·풀기, 관리자 감사 기록 쓰기는 기존 칸·함수 계약을 확인한 뒤 별도 PR로 추가합니다.</p>
  </div>;
}

function Section({ children, empty, icon: Icon, title }: { children: ReactNode; empty: string; icon: typeof Store; title: string }) { const has = Array.isArray(children) ? children.length > 0 : Boolean(children); return <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Icon aria-hidden="true" className="h-4 w-4" />{title}</CardTitle></CardHeader><CardContent className="space-y-2">{has ? children : <p className="text-sm font-semibold text-slate-500">{empty}</p>}</CardContent></Card>; }
function Row({ text, title }: { text: string; title: string }) { return <div className="min-w-0 rounded-lg border border-slate-200 p-3"><p className="break-words text-sm font-black text-slate-900">{title}</p><p className="mt-1 break-words text-xs font-semibold text-slate-600">{text}</p></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 break-words font-black text-slate-900">{value}</p></div>; }
function Summary({ label, tone, value }: { label: string; tone?: "warn"; value: number }) { return <Card className={tone ? "border-rose-200 bg-rose-50" : ""}><CardContent className="p-4"><p className="text-xs font-bold text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value.toLocaleString()}</p></CardContent></Card>; }
function Notice({ kind, text }: { kind: "error" | "status"; text: string }) { return <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900" role={kind === "error" ? "alert" : "status"}><AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0" />{text}</div>; }
function href(params: { duplicate?: string; q?: string }, storeId: string) { const q = new URLSearchParams(); if (params.q) q.set("q", params.q); if (params.duplicate) q.set("duplicate", params.duplicate); q.set("storeId", storeId); return `/admin/stores?${q}`; }
const statusLabel = (value: string) => ({ active: "활성", suspended: "멈춤", closed: "종료", registration_pending: "개업 준비 중", removed: "내보냄" }[value] || value);
const roleLabel = (value: string) => ({ owner: "점주", manager: "관리자", staff: "직원" }[value] || value);
const originLabel = (value: string) => ({ direct: "직접 가입", link: "초대 연결", backfill: "기존 매장 전환" }[value] || value);
const fieldLabel = (value: string) => ({ storeName: "매장명", representativeName: "대표자", baseAddress: "주소", addressDetail: "상세 주소", deliveryContactPhone: "배송 연락처", preferredDeliveryTime: "희망 배송 시간", accessNote: "출입 안내" }[value] || value);
const formatDate = (value: string) => new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
const formatBusinessNumber = (value: string | null) => value?.replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3") || "미입력";
