import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FieldRecordPanel } from "@/components/field-record-panel";
import { MobileLocationReporter } from "@/components/mobile-location-reporter";
import { getCustomerSession } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 기사·영업·알바 공통 [현장 기록] 화면. 기능 플래그(FIELD_RECORDS, 기본 OFF + 회사 allowlist)가 꺼져 있으면 404. */
export default async function MobileFieldPage({ searchParams }: { searchParams?: Promise<{ customerId?: string; leadId?: string; name?: string }> }) {
  const session = await getCustomerSession();
  if (!session?.userId) redirect("/mobile/join");
  if (!isFeatureEnabled("FIELD_RECORDS", session.companyId)) notFound();
  const params = (await searchParams) ?? {};
  const customerId = params.customerId && UUID.test(params.customerId) ? params.customerId : undefined;
  const leadId = params.leadId && UUID.test(params.leadId) ? params.leadId : undefined;
  return (
    <main className="mobile-shell mx-auto flex min-h-dvh max-w-md flex-col gap-3 p-3">
      <header className="flex items-center justify-between">
        <h1 className="text-base font-black">현장 기록</h1>
        <Link className="text-xs font-semibold underline" href="/mobile/sales">영업 화면</Link>
      </header>
      {/* 화면을 연 동안 위치를 보낸다(대표 결정). 같은 화면의 기록 위치와 지도 위치가 함께 쌓인다. */}
      <MobileLocationReporter autoStart />
      <FieldRecordPanel customerId={customerId} leadId={leadId} targetName={params.name?.slice(0, 40)} />
    </main>
  );
}
