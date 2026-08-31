"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { DashboardConsistencyCheck } from "@/components/dashboard-consistency-check";

type UploadHistoryItem = {
  id: string;
  filename: string;
  rows: number;
  status: "completed" | "running" | "failed";
  qualityScore: number;
  duplicateCount: number;
  healthScore: number;
  createdAt: string;
};

function getAdminCompanyIdFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("companyId") || "";
}

function useAdminCompanyId() {
  const [companyId, setCompanyId] = useState("");
  useEffect(() => {
    setCompanyId(getAdminCompanyIdFromUrl());
  }, []);
  return companyId;
}

// 2026-08-30 피드백("다수 고객들 사용할 수 있도록 개선된거야?") 대응: 이 페이지는 클라이언트
// 컴포넌트라 서버 세션을 직접 읽지 못해, 지금까지는 모든 일반 고객 로그인에 회사명/이름을
// "마주식자재"/"정두영"으로 고정 표시하고 있었습니다(다른 고객사가 로그인해도 항상 이렇게 보임 —
// 실제 데이터 자체는 세션 쿠키로 서버에서 이미 회사별로 분리돼 있지만 헤더 표시만 틀렸던 것).
// /api/customer/me로 실제 로그인한 회사명·이름을 가져와 어떤 고객사든 자기 정보를 보게 합니다.
function useCustomerIdentity(isAdminPreview: boolean) {
  const [companyName, setCompanyName] = useState("");
  const [userName, setUserName] = useState("");
  useEffect(() => {
    if (isAdminPreview) return;
    let ignore = false;
    fetch("/api/customer/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (ignore || !payload?.session) return;
        setCompanyName(payload.session.companyName || "");
        setUserName(payload.session.name || "");
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [isAdminPreview]);
  return { companyName, userName };
}


export default function CustomerDataManagementPage() {
  const adminCompanyId = useAdminCompanyId();
  const isAdminPreview = Boolean(adminCompanyId);
  const { companyName: sessionCompanyName, userName: sessionUserName } = useCustomerIdentity(isAdminPreview);
  const [uploads, setUploads] = useState<UploadHistoryItem[]>([]);
  const [uploadsLoaded, setUploadsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    const endpoint = adminCompanyId ? `/api/upload-history?companyId=${encodeURIComponent(adminCompanyId)}` : "/api/upload-history";

    setLoadError(false);
    fetch(endpoint, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((payload) => {
        if (!active) return;
        setUploads(Array.isArray(payload?.uploads) ? payload.uploads : []);
        setUploadsLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setLoadError(true);
        setUploadsLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [adminCompanyId]);

  const dataRegistrationHref = adminCompanyId ? `/?companyId=${encodeURIComponent(adminCompanyId)}` : "/";

  return (
    <CustomerAppShell
      active="data-management"
      companyName={isAdminPreview ? "선택 고객사" : sessionCompanyName || "고객사"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={adminCompanyId || undefined}
      subtitle="등록 이력, 누락, 미매칭 확인"
      title="등록 이력 조회"
      userName={isAdminPreview ? "관리자" : sessionUserName || "사용자"}
    >
      <div className="mx-auto max-w-[1560px] space-y-4">
        <DashboardConsistencyCheck companyId={isAdminPreview ? adminCompanyId : undefined} />

        <div className="maju-section-card">
          <div className="border-b border-slate-200/80 p-4">
            <h2 className="flex items-center gap-2 text-base font-black text-slate-950">
              <Save className="h-4 w-4 text-teal-700" />
              업로드 이력
            </h2>
            <p className="mt-1 text-xs font-bold text-slate-500">과거 데이터 업로드 작업의 파일명, 처리 건수, 시각, 처리 결과입니다.</p>
          </div>
          <div className="overflow-x-auto">
            {!uploadsLoaded ? (
              <p className="flex items-center gap-1.5 p-4 text-sm font-bold text-slate-400">
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                업로드 이력을 불러오는 중입니다...
              </p>
            ) : loadError ? (
              <p className="p-4 text-sm font-bold text-rose-600">업로드 이력을 불러오지 못했습니다. 새로고침해서 다시 시도해주세요.</p>
            ) : uploads.length === 0 ? (
              <p className="p-4 text-sm font-bold text-slate-400">업로드 이력이 아직 없습니다. 거래처 관리 &gt; 등록에서 엑셀을 업로드해보세요.</p>
            ) : (
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-black uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5">파일명</th>
                    <th className="px-4 py-2.5">건수</th>
                    <th className="px-4 py-2.5">품질점수</th>
                    <th className="px-4 py-2.5">중복</th>
                    <th className="px-4 py-2.5">상태</th>
                    <th className="px-4 py-2.5">등록일시</th>
                    <th className="px-4 py-2.5">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((upload) => (
                    <tr className="border-b border-slate-100 last:border-0" key={upload.id}>
                      <td className="px-4 py-2.5 font-bold text-slate-800">{upload.filename || "파일명 없음"}</td>
                      <td className="px-4 py-2.5 text-slate-600">{upload.rows.toLocaleString()}행</td>
                      <td className="px-4 py-2.5 text-slate-600">{upload.qualityScore}점</td>
                      <td className="px-4 py-2.5 text-slate-600">{upload.duplicateCount}건</td>
                      <td className="px-4 py-2.5">
                        <Badge
                          className={
                            upload.status === "completed"
                              ? "bg-emerald-100 text-emerald-800"
                              : upload.status === "failed"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-amber-100 text-amber-800"
                          }
                        >
                          {upload.status === "completed" ? "완료" : upload.status === "failed" ? "실패" : "진행 중"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{upload.createdAt}</td>
                      <td className="px-4 py-2.5">
                        {upload.status === "failed" ? (
                          <Link className="text-xs font-bold text-teal-700 underline underline-offset-2" href={dataRegistrationHref}>
                            다시 업로드
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </CustomerAppShell>
  );
}
