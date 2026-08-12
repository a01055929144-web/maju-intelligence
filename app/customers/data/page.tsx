"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { CustomerWorkspaceTabs } from "@/components/customer-workspace-tabs";
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

export default function CustomerDataManagementPage() {
  const adminCompanyId = useAdminCompanyId();
  const isAdminPreview = Boolean(adminCompanyId);
  const [uploads, setUploads] = useState<UploadHistoryItem[]>([]);
  const [uploadsLoaded, setUploadsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const endpoint = adminCompanyId ? `/api/upload-history?companyId=${encodeURIComponent(adminCompanyId)}` : "/api/upload-history";

    fetch(endpoint, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!active) return;
        setUploads(Array.isArray(payload?.uploads) ? payload.uploads : []);
        setUploadsLoaded(true);
      })
      .catch(() => {
        if (active) setUploadsLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [adminCompanyId]);

  return (
    <CustomerAppShell
      active="data-management"
      companyName={isAdminPreview ? "선택 고객사" : "마주식자재"}
      mode={isAdminPreview ? "admin-preview" : "customer"}
      previewCompanyId={adminCompanyId || undefined}
      subtitle="데이터 등록 이력과 누락·미매칭·정합성 문제를 확인하고 관리합니다."
      title="거래처 관리 · 데이터 관리"
      userName={isAdminPreview ? "관리자" : "정두영"}
    >
      <CustomerWorkspaceTabs />
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
              <p className="p-6 text-sm font-bold text-slate-400">불러오는 중…</p>
            ) : uploads.length === 0 ? (
              <p className="p-6 text-sm font-bold text-slate-400">업로드 이력이 아직 없습니다. 거래처 관리 &gt; 등록에서 엑셀을 업로드해보세요.</p>
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
