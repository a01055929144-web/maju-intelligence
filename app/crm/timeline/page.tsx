"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Banknote, Building2, FileText, PackageCheck, Phone, Route, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { sampleCustomers } from "@/lib/sample-data";

type TimelineItem = {
  id: string;
  expectedRevenue: number;
  leadName: string;
  memo: string;
  nextAction: string;
  region: string;
  result: string;
  visitedAt: string;
};

type DbSummary = {
  description: string;
  label: string;
  normalizedCustomers: number | null;
  tone: "ready" | "fallback";
  visitResults: number | null;
};

const resultLabels: Record<string, string> = {
  visited: "방문 완료",
  interested: "관심 있음",
  "quote-requested": "견적 요청",
  pending: "보류",
  failed: "실패"
};

const defaultDbSummary: DbSummary = {
  description: "DB 상태를 확인 중입니다. 실패해도 화면은 샘플 데이터로 유지됩니다.",
  label: "DB 확인 중",
  normalizedCustomers: null,
  tone: "fallback",
  visitResults: null
};

export default function CrmTimelinePage() {
  const [timeline, setTimeline] = useState<TimelineItem[]>(sampleVisitTimeline);
  const [dbSummary, setDbSummary] = useState<DbSummary>(defaultDbSummary);
  const [dbError, setDbError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    let active = true;

    fetch("/api/customer/history-status", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        if (payload?.timeline?.length) setTimeline(payload.timeline);
        if (payload?.dbSummary) setDbSummary(payload.dbSummary);
        if (payload?.errorMessage) setDbError(payload.errorMessage);
      })
      .catch((error) => {
        if (!active) return;
        setDbError(error instanceof Error ? error.message : "DB 상태 API 호출 실패");
        setDbSummary({
          description: "DB 상태 API 호출에 실패했습니다. 화면은 샘플 데이터로 유지합니다.",
          label: "DB 확인 실패",
          normalizedCustomers: null,
          tone: "fallback",
          visitResults: null
        });
      });

    return () => {
      active = false;
    };
  }, []);

  const enrichedCustomers = useMemo(
    () =>
      sampleCustomers.map((customer, index) => ({
        ...customer,
        businessNumber: `123-${String(10 + index).padStart(2, "0")}-${String(10000 + index).padStart(5, "0")}`,
        businessStatus: index % 7 === 0 ? "확인 필요" : "정상",
        deliveryManager: ["김배송 매니저", "박배송 매니저", "이배송 매니저", "최배송 매니저"][index % 4],
        grade: revenueGrade(customer.monthlyRevenue),
        memoCount: 2 + (index % 4),
        phone: `010-${String(3100 + index).padStart(4, "0")}-${String(1000 + index).padStart(4, "0")}`,
        loadingPosition: index % 3 === 0 ? "후문 냉장창고 앞" : index % 3 === 1 ? "1층 주방 입구" : "건물 우측 적재 구역"
      })),
    []
  );
  const selectedCustomer = enrichedCustomers[selectedIndex] || enrichedCustomers[0];
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
      <section className="mx-auto max-w-[1760px] space-y-4">
        <div className="grid gap-3 lg:grid-cols-4">
          <SummaryCard label="전체 거래처" value={`${enrichedCustomers.length}곳`} helper="기초 등록된 매장" />
          <SummaryCard label="A등급 거래처" value={`${enrichedCustomers.filter((customer) => customer.grade === "A").length}곳`} helper="매출 상위 고객" tone="emerald" />
          <SummaryCard label="방문 기록" value={`${timeline.length}건`} helper={`${quoteRequests}건 견적 요청`} tone="blue" />
          <SummaryCard label="예상매출" value={`${expectedRevenue.toLocaleString()}만원`} helper="최근 액션 기준" tone="violet" />
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={dbSummary.tone === "ready" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{dbSummary.label}</Badge>
              <p className="text-sm font-bold leading-6 text-slate-600">{dbSummary.description}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-black text-slate-500">
              <span className="rounded-md bg-slate-100 px-3 py-2">정제 거래처 {formatDbCount(dbSummary.normalizedCustomers)}</span>
              <span className="rounded-md bg-slate-100 px-3 py-2">방문 결과 {formatDbCount(dbSummary.visitResults)}</span>
            </div>
          </div>
          {dbError ? <p className="mt-3 rounded-md bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">DB/API 확인 메시지: {dbError}</p> : null}
        </div>

        <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black text-slate-950">거래처 목록</h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">매장을 누르면 상세 정보가 오른쪽에 표시됩니다.</p>
                </div>
                <Badge className="bg-slate-100 text-slate-700">{enrichedCustomers.length}곳</Badge>
              </div>
            </div>
            <div className="max-h-[calc(100vh-280px)] space-y-2 overflow-auto p-3">
              {enrichedCustomers.map((customer, index) => (
                <button
                  key={`${customer.customerName}-${customer.address}`}
                  className={`w-full rounded-md border p-4 text-left transition ${
                    index === selectedIndex ? "border-blue-300 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                  onClick={() => setSelectedIndex(index)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{customer.customerName}</p>
                      <p className="mt-1 truncate text-xs font-bold text-slate-500">{customer.region} · {customer.address}</p>
                    </div>
                    <Badge className={gradeClassName(customer.grade)}>{customer.grade}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                    <span className="rounded bg-slate-100 px-2 py-1">{customer.industry}</span>
                    <span className="rounded bg-slate-100 px-2 py-1">{customer.deliveryKm}km</span>
                    <span className="rounded bg-slate-100 px-2 py-1">{customer.monthlyRevenue}만원</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <div className="min-w-0 space-y-4">
            <div className="rounded-md border border-slate-200 bg-white p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <Badge className="mb-3 bg-blue-50 text-blue-700">선택 거래처</Badge>
                  <h2 className="truncate text-2xl font-black text-slate-950">{selectedCustomer.customerName}</h2>
                  <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                    {selectedCustomer.deliveryManager} · {selectedCustomer.region} · {selectedCustomer.address}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Badge className={gradeClassName(selectedCustomer.grade)}>매출 {selectedCustomer.grade}등급</Badge>
                  <Badge className={selectedCustomer.businessStatus === "정상" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}>
                    사업자 {selectedCustomer.businessStatus}
                  </Badge>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                <InfoTile icon={Building2} label="사업자번호" value={selectedCustomer.businessNumber} />
                <InfoTile icon={Phone} label="연락처" value={selectedCustomer.phone} />
                <InfoTile icon={Banknote} label="월 매출" value={`${selectedCustomer.monthlyRevenue.toLocaleString()}만원`} />
                <InfoTile icon={Route} label="배송거리" value={`${selectedCustomer.deliveryKm}km`} />
              </div>
            </div>

            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="rounded-md border border-slate-200 bg-white p-5">
                <h3 className="text-base font-black text-slate-950">기본 정보</h3>
                <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2">
                  <DetailRow label="상호명" value={selectedCustomer.customerName} />
                  <DetailRow label="사업자번호" value={selectedCustomer.businessNumber} />
                  <DetailRow label="대표자명" value={selectedIndex % 2 === 0 ? "김민준" : "이서연"} />
                  <DetailRow label="업종" value={selectedCustomer.industry} />
                  <DetailRow label="지역" value={selectedCustomer.region} />
                  <DetailRow label="주소" value={selectedCustomer.address} />
                  <DetailRow label="최근 주문" value={`${selectedCustomer.lastOrderDays}일 전`} />
                  <DetailRow label="담당자" value={selectedCustomer.deliveryManager} />
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-5">
                <h3 className="text-base font-black text-slate-950">배송 적재위치</h3>
                <p className="mt-3 rounded-md border border-blue-100 bg-blue-50 p-4 text-sm font-black leading-6 text-blue-800">{selectedCustomer.loadingPosition}</p>
                <div className="mt-4 grid gap-2">
                  <AttachmentRow icon={PackageCheck} label="적재위치 사진/영상" value="3개 등록 예정" />
                  <AttachmentRow icon={FileText} label="사업자등록증" value="OCR 검수 대기" />
                  <AttachmentRow icon={FileText} label="통장사본" value="수취 완료" />
                </div>
              </div>
            </div>

            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="rounded-md border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black text-slate-950">메모 히스토리</h3>
                    <p className="mt-1 text-sm font-medium text-slate-500">상담, 배송 특이사항, 대표 요청사항을 누적합니다.</p>
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

              <div className="rounded-md border border-slate-200 bg-white p-5">
                <Badge className="mb-3 bg-violet-50 text-violet-700">영업 방문 기록</Badge>
                <h3 className="text-base font-black text-slate-950">최근 액션</h3>
                <div className="mt-4 space-y-3">
                  {timeline.map((item) => (
                    <div key={item.id} className="rounded-md border border-slate-200 p-4">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <p className="font-black text-slate-950">{item.leadName}</p>
                        <Badge className="bg-blue-50 text-blue-700">{resultLabels[item.result] || item.result}</Badge>
                      </div>
                      <p className="text-sm font-medium leading-6 text-slate-600">{item.memo || "메모 없음"}</p>
                      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs font-bold text-slate-500">
                        <span>다음 액션: {item.nextAction || "미정"}</span>
                        <span>{item.visitedAt}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </CustomerAppShell>
  );
}

function MiniMetric({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-md border border-slate-200 bg-slate-50 p-3 ${wide ? "col-span-2" : ""}`}>
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function SummaryCard({ label, value, helper, tone = "slate" }: { helper: string; label: string; tone?: "slate" | "emerald" | "blue" | "violet"; value: string }) {
  const toneClassName = {
    blue: "text-blue-700",
    emerald: "text-emerald-700",
    slate: "text-slate-950",
    violet: "text-violet-700"
  }[tone];

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className={`mt-2 whitespace-nowrap text-2xl font-black ${toneClassName}`}>{value}</p>
      <p className="mt-1 truncate text-xs font-bold text-slate-400">{helper}</p>
    </div>
  );
}

function InfoTile({ icon: Icon, label, value }: { icon: typeof Store; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-slate-50 p-4">
      <Icon className="mb-3 h-4 w-4 text-blue-700" />
      <p className="text-xs font-black text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-950" title={value}>
        {value}
      </p>
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

function formatDbCount(value: number | null) {
  return value === null ? "확인 필요" : `${value.toLocaleString()}건`;
}

const sampleVisitTimeline: TimelineItem[] = [
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
