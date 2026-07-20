"use client";

import Link from "next/link";
import { Download, ExternalLink, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { UploadHistoryItem } from "@/lib/store";

const statusCopy = {
  all: "전체",
  needsAction: "보완 필요",
  completed: "완료",
  failed: "실패",
  running: "진행중"
};

type UploadStatusFilter = keyof typeof statusCopy;

export function AdminUploadsWorkspace({ uploads }: { uploads: UploadHistoryItem[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<UploadStatusFilter>("all");

  const filteredUploads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return uploads.filter((upload) => {
      const matchesStatus = status === "all" || (status === "needsAction" ? needsReview(upload) : upload.status === status);
      const matchesQuery =
        !normalizedQuery ||
        [upload.filename, upload.company, upload.createdAt, upload.status].some((value) => value.toLowerCase().includes(normalizedQuery));
      return matchesStatus && matchesQuery;
    });
  }, [query, status, uploads]);
  const issueUploads = useMemo(() => uploads.filter(needsReview), [uploads]);

  function downloadCsv() {
    const rows = filteredUploads.map((upload) => ({
      파일명: upload.filename,
      고객사: upload.company,
      상태: statusCopy[upload.status],
      처리행수: upload.rows,
      품질점수: upload.qualityScore,
      중복건수: upload.duplicateCount,
      건강도: upload.healthScore,
      리포트ID: upload.reportId || "",
      고객사ID: upload.companyId,
      생성일시: upload.createdAt
    }));
    const csv = toCsv(rows);
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `maju_upload_history_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {issueUploads.length ? (
        <div className="grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="font-black text-amber-950">보완이 필요한 업로드 {issueUploads.length.toLocaleString()}건</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-amber-800">
              실패, 품질 80% 미만, 중복 후보, 리포트 미생성 건을 먼저 확인하세요.
            </p>
          </div>
          <Button className="w-fit bg-amber-900 text-white hover:bg-amber-950" onClick={() => setStatus("needsAction")} type="button">
            보완 필요만 보기
          </Button>
        </div>
      ) : (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
          <p className="font-black text-primary">현재 보완이 필요한 업로드가 없습니다.</p>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">실패, 중복, 품질 저하, 리포트 미생성 상태가 발견되면 이곳에 표시됩니다.</p>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
        <label className="flex h-11 items-center gap-2 rounded-md border border-border bg-white px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="파일명, 고객사, 날짜 검색..."
            value={query}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(statusCopy) as UploadStatusFilter[]).map((key) => (
            <button
              className={`h-10 rounded-md border px-3 text-sm font-black transition ${
                status === key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white text-foreground hover:bg-muted"
              }`}
              key={key}
              onClick={() => setStatus(key)}
              type="button"
            >
              {statusCopy[key]}
            </button>
          ))}
        </div>
        <Button className="h-10 gap-2" onClick={downloadCsv} type="button" variant="outline">
          <Download className="h-4 w-4" />
          CSV 다운로드
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
        <span className="font-bold text-muted-foreground">검색 결과</span>
        <span className="font-black">{filteredUploads.length.toLocaleString()}건</span>
      </div>

      {filteredUploads.length ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <div className="min-w-[1180px]">
            <div className="grid grid-cols-[1.35fr_1fr_100px_110px_100px_100px_220px] bg-muted/70 px-4 py-3 text-xs font-black text-muted-foreground">
              <span>파일</span>
              <span>고객사</span>
              <span className="text-right">행 수</span>
              <span>상태</span>
              <span className="text-right">품질</span>
              <span className="text-right">중복</span>
              <span className="text-center">운영 액션</span>
            </div>
            <div className="divide-y divide-border">
              {filteredUploads.map((upload) => (
                <UploadRow key={upload.id} upload={upload} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="font-black">조건에 맞는 업로드 이력이 없습니다.</p>
          <p className="mt-2 text-sm text-muted-foreground">검색어 또는 상태 필터를 조정해보세요.</p>
        </div>
      )}
    </div>
  );
}

function UploadRow({ upload }: { upload: UploadHistoryItem }) {
  const reviewNeeded = needsReview(upload);
  const companyQuery = `companyId=${encodeURIComponent(upload.companyId)}`;

  return (
    <div className="grid grid-cols-[1.35fr_1fr_100px_110px_100px_100px_220px] items-center px-4 py-3 text-sm">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate font-black">{upload.filename}</p>
          {reviewNeeded ? <Badge className="shrink-0 bg-amber-100 text-amber-800">보완</Badge> : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{upload.createdAt}</p>
      </div>
      <div className="min-w-0">
        <p className="truncate font-bold">{upload.company}</p>
        <Link className="mt-1 inline-flex items-center gap-1 text-xs font-black text-primary hover:underline" href={`/dashboard?${companyQuery}`}>
          대시보드
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <p className="text-right font-black">{upload.rows.toLocaleString()}</p>
      <Badge className={statusClass(upload.status)}>{statusCopy[upload.status]}</Badge>
      <div className="text-right">
        <p className="font-black">{upload.qualityScore}%</p>
        <Progress className="mt-1 h-1.5" value={upload.qualityScore} />
      </div>
      <p className="text-right font-black">{upload.duplicateCount.toLocaleString()}건</p>
      <div className="flex justify-center gap-2">
        {upload.reportId ? (
          <Link className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-white px-2.5 text-xs font-bold transition hover:bg-muted" href={`/reports/${upload.reportId}?${companyQuery}`}>
            리포트
          </Link>
        ) : (
          <span className="inline-flex h-8 items-center justify-center rounded-md bg-muted px-2.5 text-xs font-bold text-muted-foreground">미생성</span>
        )}
        <Link className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-white px-2.5 text-xs font-bold transition hover:bg-muted" href={`/?${companyQuery}`}>
          등록
        </Link>
        <Link className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-white px-2.5 text-xs font-bold transition hover:bg-muted" href={`/revenue/transactions?${companyQuery}`}>
          매출
        </Link>
      </div>
    </div>
  );
}

function statusClass(status: UploadHistoryItem["status"]) {
  if (status === "completed") return "w-fit justify-center bg-primary/10 text-primary";
  if (status === "failed") return "w-fit justify-center bg-destructive/10 text-destructive";
  return "w-fit justify-center bg-amber-100 text-amber-800";
}

function needsReview(upload: UploadHistoryItem) {
  return upload.status === "failed" || upload.qualityScore < 80 || upload.duplicateCount > 0 || !upload.reportId;
}

function toCsv(rows: Record<string, string | number>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const body = rows.map((row) => headers.map((header) => csvCell(row[header])).join(","));
  return [headers.join(","), ...body].join("\n");
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}
