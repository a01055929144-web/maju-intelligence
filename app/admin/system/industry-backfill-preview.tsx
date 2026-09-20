"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type BackfillSample = {
  after: string;
  before: string;
  companyId: string;
  id: string;
  kind: "customer" | "lead";
  name: string;
};

type BackfillPreview = {
  customerCandidates: number;
  customersScanned: number;
  leadCandidates: number;
  leadsScanned: number;
  samples: BackfillSample[];
};

export function IndustryBackfillPreview() {
  const [preview, setPreview] = useState<BackfillPreview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const loadPreview = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/industry-backfill", { cache: "no-store" });
      const payload = (await response.json()) as { message?: string; preview?: BackfillPreview };
      if (!response.ok || !payload.preview) throw new Error(payload.message || "후보를 불러오지 못했습니다.");
      setPreview(payload.preview);
    } catch (loadError) {
      setPreview(null);
      setError(loadError instanceof Error ? loadError.message : "후보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const totalCandidates = preview ? preview.customerCandidates + preview.leadCandidates : 0;

  return (
    <Card id="industry-backfill-preview">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>카카오 업종 백필 후보</CardTitle>
            <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
              표준 8개 업종으로 재분류 가능한 기존 거래처와 리드를 읽기 전용으로 확인합니다.
            </p>
          </div>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-black text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            onClick={loadPreview}
            type="button"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "조회 중" : preview ? "다시 조회" : "후보 조회"}
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-900">
          이 화면은 데이터를 변경하지 않습니다. 실제 적용은 운영 DB 백업과 후보 검토가 끝난 뒤 별도 명령으로만 진행합니다.
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {preview ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <PreviewMetric label="전체 후보" value={totalCandidates} />
              <PreviewMetric label={`거래처 · ${preview.customersScanned.toLocaleString()}건 검사`} value={preview.customerCandidates} />
              <PreviewMetric label={`리드 · ${preview.leadsScanned.toLocaleString()}건 검사`} value={preview.leadCandidates} />
            </div>

            {preview.samples.length ? (
              <div className="overflow-hidden rounded-md border border-border">
                <div className="border-b border-border bg-muted/40 px-4 py-3 text-sm font-black">변경 예상 표본 · 최대 30건</div>
                <div className="divide-y divide-border">
                  {preview.samples.map((sample) => (
                    <div className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[100px_minmax(0,1fr)_minmax(0,1fr)] md:items-center" key={`${sample.kind}-${sample.id}`}>
                      <Badge className="w-fit bg-slate-100 text-slate-700">{sample.kind === "customer" ? "거래처" : "리드"}</Badge>
                      <div className="min-w-0">
                        <p className="truncate font-black text-slate-950">{sample.name || "이름 없음"}</p>
                        <p className="truncate text-xs font-semibold text-muted-foreground">회사 {sample.companyId}</p>
                      </div>
                      <p className="font-bold text-slate-700">
                        <span className="text-rose-700">{sample.before}</span>
                        <span className="px-2 text-muted-foreground">→</span>
                        <span className="text-emerald-700">{sample.after}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />
                재분류가 필요한 후보가 없습니다.
              </div>
            )}
          </>
        ) : (
          <p className="text-sm font-semibold text-muted-foreground">후보 조회를 눌러 운영 데이터의 대상 건수와 표본을 확인하세요.</p>
        )}
      </CardContent>
    </Card>
  );
}

function PreviewMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-white p-4">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-black text-slate-950">{value.toLocaleString()}건</p>
    </div>
  );
}
