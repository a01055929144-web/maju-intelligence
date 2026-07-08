import Link from "next/link";
import { Banknote, Building2, FileText, PackageCheck, Phone, Route, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { getSystemDiagnostics, getVisitTimeline } from "@/lib/store";
import { sampleCustomers } from "@/lib/sample-data";

const resultLabels: Record<string, string> = {
  visited: "방문 완료",
  interested: "관심 있음",
  "quote-requested": "견적 요청",
  pending: "보류",
  failed: "실패"
};

export default async function CrmTimelinePage() {
  const [timelineResult, systemResult] = await Promise.all([loadVisitTimeline(), loadSystemDiagnostics()]);
  const timeline = timelineResult.items;
  const dbSummary = buildDatabaseSummary(systemResult);
  const enrichedCustomers = sampleCustomers.map((customer, index) => ({
    ...customer,
    businessNumber: `123-${String(10 + index).padStart(2, "0")}-${String(10000 + index).padStart(5, "0")}`,
    businessStatus: index % 7 === 0 ? "확인 필요" : "정상",
    deliveryManager: ["김배송 매니저", "박배송 매니저", "이배송 매니저", "최배송 매니저"][index % 4],
    grade: revenueGrade(customer.monthlyRevenue),
    memoCount: 2 + (index % 4),
    phone: `010-${String(3100 + index).padStart(4, "0")}-${String(1000 + index).padStart(4, "0")}`,
    loadingPosition: index % 3 === 0 ? "후문 냉장창고 앞" : index % 3 === 1 ? "1층 주방 입구" : "건물 우측 적재 구역"
  }));
  const selectedCustomer = enrichedCustomers[0];
  const quoteRequests = timeline.filter((item) => item.result === "quote-requested").length;
  const expectedRevenue = timeline.reduce((total, item) => total + item.expectedRevenue, 0);

  return (
    <CustomerAppShell
      active="customers"
      companyName="관리자 미리보기"
      rightAction={
        <Link
          className="inline-flex h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-bold text-white transition hover:bg-slate-800"
          href="/routes/today"
        >
          영업·배송 코스
        </Link>
      }
      subtitle="매장 기본정보, 사업자 상태, 배송 적재위치, 메모와 방문 기록을 거래처별로 관리합니다."
      title="거래처 히스토리"
      userName="관리자"
    >
      <section className="mx-auto grid max-w-[1880px] gap-4 xl:grid-cols-[360px_minmax(0,1fr)_420px]">
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <Badge className="mb-3 bg-emerald-50 text-emerald-800">거래처 원장</Badge>
            <h2 className="text-lg font-black text-slate-950">전체 거래처</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">매출 등급과 사업자 상태 기준으로 먼저 확인합니다.</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <MiniMetric label="전체" value={`${enrichedCustomers.length}곳`} />
              <MiniMetric label="A등급" value={`${enrichedCustomers.filter((customer) => customer.grade === "A").length}곳`} />
              <MiniMetric label="확인" value={`${enrichedCustomers.filter((customer) => customer.businessStatus !== "정상").length}곳`} />
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-4">
            <Badge className={dbSummary.tone === "ready" ? "mb-3 bg-emerald-100 text-emerald-800" : "mb-3 bg-amber-100 text-amber-800"}>{dbSummary.label}</Badge>
            <h2 className="text-base font-black text-slate-950">DB 연결 상태</h2>
            <p className="mt-1 text-sm font-medium leading-6 text-slate-500">{dbSummary.description}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniMetric label="정제 거래처" value={formatDbCount(dbSummary.normalizedCustomers)} />
              <MiniMetric label="방문 결과" value={formatDbCount(dbSummary.visitResults)} />
            </div>
            {timelineResult.source === "fallback" ? (
              <p className="mt-3 rounded-md bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">
                방문 히스토리 DB 조회 실패: {timelineResult.errorMessage}. 화면은 샘플 히스토리로 유지합니다.
              </p>
            ) : null}
          </div>

          <div className="max-h-[680px] space-y-2 overflow-auto pr-1">
            {enrichedCustomers.map((customer, index) => (
              <a
                key={`${customer.customerName}-${customer.address}`}
                className={`block rounded-md border p-4 transition ${
                  index === 0 ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
                href={`#customer-${index}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">{customer.customerName}</p>
                    <p className="mt-1 truncate text-xs font-bold text-slate-500">{customer.address}</p>
                  </div>
                  <Badge className={gradeClassName(customer.grade)}>{customer.grade}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-bold text-slate-500">
                  <span>{customer.industry}</span>
                  <span>{customer.deliveryKm}km</span>
                  <span>{customer.monthlyRevenue}만원</span>
                </div>
              </a>
            ))}
          </div>
        </aside>

        <div className="space-y-4">
          <div className="rounded-md border border-slate-200 bg-white p-5" id="customer-0">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Badge className="mb-3 bg-blue-50 text-blue-700">선택 거래처</Badge>
                <h2 className="text-2xl font-black text-slate-950">{selectedCustomer.customerName}</h2>
                <p className="mt-1 text-sm font-bold text-slate-500">{selectedCustomer.deliveryManager} · {selectedCustomer.region} · {selectedCustomer.address}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className={gradeClassName(selectedCustomer.grade)}>매출 {selectedCustomer.grade}등급</Badge>
                <Badge className={selectedCustomer.businessStatus === "정상" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}>
                  사업자 {selectedCustomer.businessStatus}
                </Badge>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              <InfoTile icon={Building2} label="사업자번호" value={selectedCustomer.businessNumber} />
              <InfoTile icon={Phone} label="연락처" value={selectedCustomer.phone} />
              <InfoTile icon={Banknote} label="월 매출" value={`${selectedCustomer.monthlyRevenue.toLocaleString()}만원`} />
              <InfoTile icon={Route} label="배송거리" value={`${selectedCustomer.deliveryKm}km`} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="rounded-md border border-slate-200 bg-white p-5">
              <h3 className="text-base font-black text-slate-950">기본 정보</h3>
              <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2">
                <DetailRow label="상호명" value={selectedCustomer.customerName} />
                <DetailRow label="업종" value={selectedCustomer.industry} />
                <DetailRow label="지역" value={selectedCustomer.region} />
                <DetailRow label="주소" value={selectedCustomer.address} />
                <DetailRow label="사업자상태" value={`${selectedCustomer.businessStatus} · 매일 API 조회 예정`} />
                <DetailRow label="최근 주문" value={`${selectedCustomer.lastOrderDays}일 전`} />
                <DetailRow label="월 방문 횟수" value={`${selectedCustomer.visitCount}회`} />
                <DetailRow label="담당자" value={selectedCustomer.deliveryManager} />
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-5">
              <h3 className="text-base font-black text-slate-950">배송 적재위치</h3>
              <p className="mt-2 rounded-md border border-blue-100 bg-blue-50 p-4 text-sm font-black text-blue-800">{selectedCustomer.loadingPosition}</p>
              <div className="mt-4 grid gap-2">
                <AttachmentRow icon={PackageCheck} label="적재위치 사진/영상" value="3개 등록 예정" />
                <AttachmentRow icon={FileText} label="사업자등록증" value="OCR 검수 대기" />
                <AttachmentRow icon={FileText} label="통장사본" value="수취 완료" />
              </div>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-950">거래처별 메모 히스토리</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">상담, 배송 특이사항, 대표 요청사항을 거래처 단위로 누적합니다.</p>
              </div>
              <Badge className="bg-slate-100 text-slate-700">{selectedCustomer.memoCount}건</Badge>
            </div>
            <div className="mt-4 space-y-3">
              {[
                ["배송", "오전 10시 전 입고 요청. 후문 적재 시 직원 호출 필요."],
                ["상담", "7월 단가표 재전달 필요. 다음 방문 시 냉동 품목 샘플 제안."],
                ["정산", "월말 결제 유지. 통장사본 확인 완료."]
              ].map(([label, memo], index) => (
                <div key={memo} className="rounded-md border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Badge className="bg-slate-100 text-slate-700">{label}</Badge>
                    <span className="text-xs font-bold text-slate-400">2026-07-{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <p className="mt-2 text-sm font-bold leading-6 text-slate-700">{memo}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <Badge className="mb-3 bg-violet-50 text-violet-700">영업 방문 기록</Badge>
            <h2 className="text-lg font-black text-slate-950">최근 액션</h2>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <MiniMetric label="방문 기록" value={`${timeline.length}건`} />
              <MiniMetric label="견적 요청" value={`${quoteRequests}건`} />
              <MiniMetric label="예상매출" value={`${expectedRevenue.toLocaleString()}만원`} wide />
            </div>
          </div>

          <div className="max-h-[760px] space-y-3 overflow-auto pr-1">
            {timeline.map((item) => (
              <div key={item.id} className="rounded-md border border-slate-200 bg-white p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <p className="font-black text-slate-950">{item.leadName}</p>
                  <Badge className="bg-slate-100 text-slate-700">{item.region}</Badge>
                  <Badge className="bg-blue-50 text-blue-700">{resultLabels[item.result] || item.result}</Badge>
                </div>
                <p className="text-sm font-medium leading-6 text-slate-600">{item.memo || "메모 없음"}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-slate-500">
                  <span>다음 액션: {item.nextAction || "미정"}</span>
                  <span className="text-right">{item.visitedAt}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </CustomerAppShell>
  );
}

async function loadVisitTimeline(companyId?: string) {
  try {
    const items = await getVisitTimeline(companyId);
    return { errorMessage: "", items: items.length ? items : sampleVisitTimeline, source: "db" as const };
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : "알 수 없는 오류",
      items: sampleVisitTimeline,
      source: "fallback" as const
    };
  }
}

async function loadSystemDiagnostics() {
  try {
    return await getSystemDiagnostics();
  } catch (error) {
    return {
      databaseChecks: [],
      errorMessage: error instanceof Error ? error.message : "시스템 진단 실패",
      mode: "local-fallback" as const
    };
  }
}

function buildDatabaseSummary(system: Awaited<ReturnType<typeof loadSystemDiagnostics>>) {
  const normalizedCustomers = system.databaseChecks?.find((check) => check.name === "정제 거래처")?.count ?? null;
  const visitResults = system.databaseChecks?.find((check) => check.name === "방문 결과")?.count ?? null;
  const hasFailedCheck = system.databaseChecks?.some((check) => check.status !== "ready") ?? false;
  const ready = system.mode === "production-db" && !hasFailedCheck;

  return {
    description: ready
      ? "Supabase 실 DB가 연결되어 있고 주요 테이블 조회가 가능합니다."
      : system.mode === "production-db"
        ? "Supabase 환경변수는 있으나 일부 테이블 조회를 확인해야 합니다."
        : "Supabase 환경변수가 없거나 미완성이라 샘플 fallback과 함께 표시합니다.",
    label: ready ? "실 DB 연결" : system.mode === "production-db" ? "DB 점검 필요" : "Local fallback",
    normalizedCustomers,
    tone: ready ? "ready" : "fallback",
    visitResults
  };
}

function formatDbCount(value: number | null) {
  return value === null ? "확인 필요" : `${value.toLocaleString()}건`;
}

function MiniMetric({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-md border border-slate-200 bg-slate-50 p-3 ${wide ? "col-span-2" : ""}`}>
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: typeof Store; label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <Icon className="mb-3 h-4 w-4 text-blue-700" />
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className="mt-1 break-keep text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 text-sm">
      <p className="font-black text-slate-400">{label}</p>
      <p className="font-black text-slate-800">{value}</p>
    </div>
  );
}

function AttachmentRow({ icon: Icon, label, value }: { icon: typeof PackageCheck; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-200 p-3">
      <Icon className="h-4 w-4 text-slate-400" />
      <div className="min-w-0">
        <p className="text-sm font-black text-slate-800">{label}</p>
        <p className="text-xs font-bold text-slate-500">{value}</p>
      </div>
    </div>
  );
}

function revenueGrade(monthlyRevenue: number) {
  if (monthlyRevenue >= 350) return "A";
  if (monthlyRevenue >= 180) return "B";
  return "C";
}

function gradeClassName(grade: string) {
  if (grade === "A") return "bg-emerald-100 text-emerald-800";
  if (grade === "B") return "bg-blue-100 text-blue-800";
  return "bg-slate-100 text-slate-700";
}

const sampleVisitTimeline = [
  {
    id: "history-001",
    expectedRevenue: 320,
    leadName: "성수 온반",
    memo: "대표가 단가표 재요청. 다음 방문 때 냉동 품목 샘플 제안 예정.",
    nextAction: "단가표 발송",
    region: "성수동",
    result: "quote-requested",
    visitedAt: "2026-07-08"
  },
  {
    id: "history-002",
    expectedRevenue: 210,
    leadName: "성수 국밥집",
    memo: "오전 입고 선호. 배송 적재위치는 후문 냉장창고 앞.",
    nextAction: "배송시간 조율",
    region: "성수동",
    result: "visited",
    visitedAt: "2026-07-07"
  },
  {
    id: "history-003",
    expectedRevenue: 480,
    leadName: "강남 정식",
    memo: "한식 주력 품목 반응 좋음. 월 단위 견적 비교 요청.",
    nextAction: "월 견적서 작성",
    region: "강남구",
    result: "interested",
    visitedAt: "2026-07-06"
  }
];
