"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UploadTemplateField } from "@/lib/sample-data";

type RawRow = Record<string, string | number | boolean | null | undefined>;
type FieldMap = Record<string, string>;

export function ExcelHeaderMappingPreview({
  fieldMap,
  fields,
  headers,
  onMap,
  onRequestQualityReview,
  rows
}: {
  fields: readonly UploadTemplateField[];
  fieldMap: FieldMap;
  headers: string[];
  onMap: (map: FieldMap) => void;
  onRequestQualityReview?: () => void;
  rows: RawRow[];
}) {
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);

  if (!headers.length) return null;

  const mappedByHeader = headers.reduce<Record<string, string>>((result, header) => {
    const mappedField = fields.find((field) => fieldMap[field.key] === header);
    if (mappedField) result[header] = mappedField.key;
    return result;
  }, {});
  const requiredFields = fields.filter((field) => field.required);
  const missingRequiredFields = requiredFields.filter((field) => !fieldMap[field.key]);
  const requiredMappedCount = requiredFields.length - missingRequiredFields.length;
  const mappedHeaderCount = Object.keys(mappedByHeader).length;
  const unusedHeaderCount = Math.max(0, headers.length - mappedHeaderCount);

  function updateHeaderMapping(header: string, nextFieldKey: string) {
    const nextMap = { ...fieldMap };
    Object.keys(nextMap).forEach((fieldKey) => {
      if (nextMap[fieldKey] === header || fieldKey === nextFieldKey) delete nextMap[fieldKey];
    });
    if (nextFieldKey) nextMap[nextFieldKey] = header;
    onMap(nextMap);
  }

  function updateFieldMapping(fieldKey: string, header: string) {
    const nextMap = { ...fieldMap };
    Object.keys(nextMap).forEach((key) => {
      if (key === fieldKey || nextMap[key] === header) delete nextMap[key];
    });
    if (header) nextMap[fieldKey] = header;
    onMap(nextMap);
  }

  function applySuggestedMapping(targetHeaders: string[]) {
    const { appliedCount, nextMap } = buildSuggestedMapping(fieldMap, fields, targetHeaders);
    if (appliedCount > 0) onMap(nextMap);
    return appliedCount;
  }

  return (
    <div className="maju-section-card">
      <div className="maju-card-header p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge className="mb-2 bg-slate-900 text-white">1. 필드 매칭</Badge>
            <p className="flex items-center gap-2 text-base font-black text-slate-950">
              <FileSpreadsheet className="h-4 w-4 text-blue-700" />
              ERP 엑셀 필드 매칭
            </p>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
              실제 엑셀 컬럼과 행 미리보기 값을 확인한 뒤 MAJU 표준 필드를 지정합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-white text-slate-700 ring-1 ring-inset ring-slate-200">{rows.length.toLocaleString()}행 전체 보기</Badge>
            <Badge className={missingRequiredFields.length ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>
              {missingRequiredFields.length ? `필수 ${missingRequiredFields.length}개 남음` : "필수 완료"}
            </Badge>
            <Button className="maju-button-blue h-10 bg-blue-700 px-4 text-white hover:bg-blue-800" size="sm" type="button" onClick={() => setIsWorkspaceOpen(true)}>
              {missingRequiredFields.length ? "필수 매핑 보완" : "매핑 전용화면 열기"}
            </Button>
          </div>
        </div>
        <div className={`maju-panel mt-3 p-3 ${missingRequiredFields.length ? "border-amber-200 bg-white" : "border-emerald-200 bg-emerald-50"}`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-black text-slate-950">필수 컬럼 연결 상태</p>
              <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                {missingRequiredFields.length ? "아래 필수 필드를 먼저 연결하면 저장 가능 상태로 바뀝니다." : "필수 표준 필드가 모두 연결됐습니다. 데이터 검수 탭에서 이상값을 확인하세요."}
              </p>
            </div>
            <Badge className={missingRequiredFields.length ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>
              {requiredMappedCount}/{requiredFields.length} 연결
            </Badge>
          </div>
          {missingRequiredFields.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {missingRequiredFields.map((field) => (
                <span key={field.key} className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-800">
                  {field.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <MappingStage active label="1" title="원본 확인" value={`${rows.length.toLocaleString()}행`} />
          <MappingStage active={mappedHeaderCount > 0} label="2" title="헤더 매칭" value={`${mappedHeaderCount.toLocaleString()}개 연결`} />
          <MappingStage active={!missingRequiredFields.length} label="3" title="저장 준비" value={missingRequiredFields.length ? `필수 ${missingRequiredFields.length}개 남음` : "완료"} />
        </div>
        <div className="maju-panel mt-3 grid overflow-hidden text-xs sm:grid-cols-4">
          <MappingCounter label="엑셀 컬럼" value={`${headers.length.toLocaleString()}개`} />
          <MappingCounter label="연결 컬럼" value={`${mappedHeaderCount.toLocaleString()}개`} />
          <MappingCounter label="미사용 컬럼" value={`${unusedHeaderCount.toLocaleString()}개`} />
          <MappingCounter label="필수 연결" value={`${requiredMappedCount}/${requiredFields.length}`} />
        </div>
      </div>
      <div className="max-h-[620px] overflow-auto bg-slate-50/60 p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {headers.map((header, headerIndex) => {
            const mappedFieldKey = mappedByHeader[header] || "";
            const mappedField = fields.find((field) => field.key === mappedFieldKey);
            const samples = rows
              .slice(0, 4)
              .map((row, index) => ({ index: index + 2, value: String(row[header] ?? "").trim() }))
              .filter((sample) => sample.value);

            return (
              <div
                key={header}
                className={`flex flex-col rounded-lg border bg-white p-3 shadow-sm transition ${
                  mappedField ? (mappedField.required ? "border-blue-200" : "border-slate-200") : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-slate-400">컬럼 {headerIndex + 1} · 원본 헤더</p>
                    <p className="mt-0.5 truncate text-sm font-black text-slate-950" title={header}>
                      {header}
                    </p>
                  </div>
                  {mappedField ? (
                    <Badge className={mappedField.required ? "shrink-0 bg-blue-100 text-blue-800" : "shrink-0 bg-slate-100 text-slate-700"}>
                      {mappedField.required ? "필수 연결" : "선택 연결"}
                    </Badge>
                  ) : (
                    <Badge className="shrink-0 bg-slate-100 text-slate-500">미사용</Badge>
                  )}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {samples.length ? (
                    samples.map((sample) => (
                      <span key={`${header}-${sample.index}`} className="max-w-[160px] truncate rounded-md bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700">
                        <span className="mr-1 text-slate-400">{sample.index}행</span>
                        {sample.value}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-md bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-400">빈 값</span>
                  )}
                </div>
                <select
                  className="mt-3 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-black text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  value={mappedFieldKey}
                  onChange={(event) => updateHeaderMapping(header, event.target.value)}
                >
                  <option value="">사용하지 않음</option>
                  {fields.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                      {field.required ? " *" : ""}
                    </option>
                  ))}
                </select>
                {mappedField?.description ? <p className="mt-1.5 text-[11px] font-semibold leading-4 text-slate-500">{mappedField.description}</p> : null}
              </div>
            );
          })}
        </div>
      </div>
      <FullExcelDataPreview headers={headers} rows={rows} />
      {isWorkspaceOpen ? (
        <MappingWorkspaceModal
          fields={fields}
          fieldMap={fieldMap}
          headers={headers}
          missingRequiredFields={missingRequiredFields}
          mappedByHeader={mappedByHeader}
          rows={rows}
          onClose={() => setIsWorkspaceOpen(false)}
          onDone={() => {
            setIsWorkspaceOpen(false);
            onRequestQualityReview?.();
          }}
          onAutoMap={applySuggestedMapping}
          onFieldMap={updateFieldMapping}
          onHeaderMap={updateHeaderMapping}
        />
      ) : null}
    </div>
  );
}

function MappingCounter({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-r border-slate-200 px-3 py-2.5 last:border-r-0 sm:border-b-0">
      <p className="text-[11px] font-black text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function MappingStage({ active, label, title, value }: { active: boolean; label: string; title: string; value: string }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${active ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${active ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-500"}`}>{label}</span>
          <p className="text-xs font-black text-slate-950">{title}</p>
        </div>
        <p className={`text-xs font-black ${active ? "text-blue-800" : "text-slate-400"}`}>{value}</p>
      </div>
    </div>
  );
}

function MappingWorkspaceModal({
  fields,
  fieldMap,
  headers,
  mappedByHeader,
  missingRequiredFields,
  onClose,
  onDone,
  onAutoMap,
  onFieldMap,
  onHeaderMap,
  rows
}: {
  fields: readonly UploadTemplateField[];
  fieldMap: FieldMap;
  headers: string[];
  mappedByHeader: Record<string, string>;
  missingRequiredFields: UploadTemplateField[];
  onClose: () => void;
  onDone: () => void;
  onAutoMap: (headers: string[]) => number;
  onFieldMap: (fieldKey: string, header: string) => void;
  onHeaderMap: (header: string, fieldKey: string) => void;
  rows: RawRow[];
}) {
  const [columnFilter, setColumnFilter] = useState<"all" | "mapped" | "unmapped">("all");
  const [columnQuery, setColumnQuery] = useState("");
  const [fieldFilter, setFieldFilter] = useState<"all" | "required" | "mapped" | "unmapped">("all");
  const [fieldQuery, setFieldQuery] = useState("");
  const [autoMapMessage, setAutoMapMessage] = useState("");
  const requiredFields = fields.filter((field) => field.required);
  const optionalFields = fields.filter((field) => !field.required);
  const mappedCount = fields.filter((field) => fieldMap[field.key]).length;
  const requiredMappedCount = requiredFields.length - missingRequiredFields.length;
  const completionRate = fields.length ? Math.round((mappedCount / fields.length) * 100) : 0;
  const filteredHeaders = useMemo(() => {
    const normalizedQuery = columnQuery.trim().toLowerCase();

    return headers.filter((header) => {
      const mapped = Boolean(mappedByHeader[header]);
      if (columnFilter === "mapped" && !mapped) return false;
      if (columnFilter === "unmapped" && mapped) return false;
      if (!normalizedQuery) return true;
      return header.toLowerCase().includes(normalizedQuery);
    });
  }, [columnFilter, columnQuery, headers, mappedByHeader]);
  const filteredFields = useMemo(() => {
    const normalizedQuery = fieldQuery.trim().toLowerCase();

    return fields.filter((field) => {
      const mapped = Boolean(fieldMap[field.key]);
      if (fieldFilter === "required" && !field.required) return false;
      if (fieldFilter === "mapped" && !mapped) return false;
      if (fieldFilter === "unmapped" && mapped) return false;
      if (!normalizedQuery) return true;
      return `${field.label} ${field.description ?? ""}`.toLowerCase().includes(normalizedQuery);
    });
  }, [fieldFilter, fieldMap, fieldQuery, fields]);
  const filteredRequiredFields = filteredFields.filter((field) => field.required);
  const filteredOptionalFields = filteredFields.filter((field) => !field.required);
  const readyToReview = missingRequiredFields.length === 0;
  const unmappedColumnCount = headers.filter((header) => !mappedByHeader[header]).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/55 p-3 backdrop-blur-sm md:p-6">
      <div className="maju-section-card mx-auto flex h-full max-w-[1760px] flex-col overflow-hidden shadow-2xl">
        <div className="maju-card-header grid gap-4 bg-white px-5 py-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-blue-700 text-white">매핑 전용 화면</Badge>
              <Badge className="bg-slate-100 text-slate-700">{rows.length.toLocaleString()}행</Badge>
              <Badge className="bg-slate-100 text-slate-700">{headers.length.toLocaleString()}컬럼</Badge>
            </div>
            <h3 className="mt-2 text-xl font-black text-slate-950">엑셀 원본을 보면서 표준 필드를 연결하세요</h3>
            <div className="mt-3 grid gap-2 lg:grid-cols-3">
              <MappingStage active label="1" title="원본 컬럼 확인" value={`${filteredHeaders.length}/${headers.length}`} />
              <MappingStage active={mappedCount > 0} label="2" title="표준 필드 연결" value={`${mappedCount}/${fields.length}`} />
              <MappingStage active={readyToReview} label="3" title="저장 가능 상태" value={readyToReview ? "완료" : `필수 ${missingRequiredFields.length}개`} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge className={missingRequiredFields.length ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>
              {missingRequiredFields.length ? `필수 ${missingRequiredFields.length}개 남음` : "필수 매핑 완료"}
            </Badge>
            <Button className="maju-button-secondary h-10" type="button" variant="outline" onClick={onClose}>
              닫기
            </Button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_420px]">
          <section className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50/50">
            <div className="maju-card-header bg-white px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-950">엑셀 원본 데이터</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    실제 행 값을 보면서 ERP마다 다른 헤더를 표준 필드에 맞춥니다.
                  </p>
                </div>
                <Badge className="bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-100">원본표</Badge>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-5 py-3 shadow-sm">
              <input
                className="h-10 min-w-60 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition placeholder:text-slate-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                value={columnQuery}
                onChange={(event) => setColumnQuery(event.target.value)}
                placeholder="엑셀 컬럼명 검색..."
              />
              <div className="maju-filter-box grid grid-cols-3 gap-1.5 bg-slate-50 p-1">
                {[
                  ["all", "전체"],
                  ["unmapped", "미연결"],
                  ["mapped", "연결됨"]
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={`h-9 rounded-md border px-3 text-xs font-black transition ${
                      columnFilter === value
                        ? "border-blue-700 bg-blue-700 text-white shadow-[0_6px_14px_rgba(37,99,235,0.18)]"
                        : "border-transparent bg-white/50 text-slate-600 hover:border-blue-100 hover:bg-blue-50 hover:text-blue-800"
                    }`}
                    type="button"
                    onClick={() => setColumnFilter(value as "all" | "mapped" | "unmapped")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Badge className="bg-slate-100 text-slate-700">{filteredHeaders.length}/{headers.length}컬럼</Badge>
              <button
                className="maju-button-secondary h-10 rounded-lg border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                type="button"
                onClick={() => {
                  const appliedCount = onAutoMap(filteredHeaders);
                  setAutoMapMessage(appliedCount ? `${appliedCount}개 표준 필드를 자동 연결했습니다.` : "추가로 자동 연결할 컬럼을 찾지 못했습니다.");
                }}
              >
                보이는 컬럼 자동 매칭
              </button>
              {autoMapMessage ? <p className="basis-full text-xs font-black text-emerald-700">{autoMapMessage}</p> : null}
            </div>
            <ExcelMappingSheetTable fields={fields} headers={filteredHeaders} mappedByHeader={mappedByHeader} rows={rows} onHeaderMap={onHeaderMap} />
          </section>

          <aside className="flex min-h-0 flex-col bg-white">
            <div className="maju-card-header bg-white px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-950">표준 필드 매칭</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">필수값부터 연결하세요.</p>
                </div>
                <Badge className="bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-100">저장기준</Badge>
              </div>
            </div>
            <div className={`border-b px-4 py-3 ${missingRequiredFields.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-950">{missingRequiredFields.length ? "먼저 연결할 필수 필드" : "필수 필드 연결 완료"}</p>
                  <p className="mt-1 text-xs font-bold leading-5 text-slate-600">
                    {missingRequiredFields.length ? "필수 필드를 모두 연결해야 DB 저장 버튼이 활성화됩니다." : "선택 필드는 운영 품질을 높이기 위해 가능한 만큼 연결하세요."}
                  </p>
                </div>
                <Badge className={missingRequiredFields.length ? "bg-white text-amber-800" : "bg-white text-emerald-800"}>
                  {requiredMappedCount}/{requiredFields.length}
                </Badge>
              </div>
              {missingRequiredFields.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {missingRequiredFields.map((field) => (
                    <span key={field.key} className="rounded-md bg-white px-2 py-1 text-[11px] font-black text-amber-800 ring-1 ring-inset ring-amber-100">
                      {field.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="space-y-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <input
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition placeholder:text-slate-400 focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                value={fieldQuery}
                onChange={(event) => setFieldQuery(event.target.value)}
                placeholder="표준 필드 검색..."
              />
              <div className="maju-filter-box grid grid-cols-4 gap-1.5 p-1">
                {[
                  ["all", "전체"],
                  ["required", "필수"],
                  ["unmapped", "미연결"],
                  ["mapped", "연결됨"]
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={`h-9 rounded-md border px-2 text-xs font-black transition ${
                      fieldFilter === value
                        ? "border-slate-900 bg-slate-900 text-white shadow-[0_6px_14px_rgba(15,23,42,0.14)]"
                        : "border-transparent bg-slate-50 text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950"
                    }`}
                    type="button"
                    onClick={() => setFieldFilter(value as "all" | "required" | "mapped" | "unmapped")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 text-xs font-black text-slate-500">
                <span>{filteredFields.length}/{fields.length}개 표준 필드 표시</span>
                <span>미연결 {fields.length - mappedCount}개</span>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
              {filteredFields.length ? (
                <>
                  <FieldMappingGroup fields={filteredRequiredFields} fieldMap={fieldMap} headers={headers} title="필수 필드" tone="required" onFieldMap={onFieldMap} />
                  <FieldMappingGroup fields={filteredOptionalFields} fieldMap={fieldMap} headers={headers} title="선택 필드" tone="optional" onFieldMap={onFieldMap} />
                </>
              ) : (
                <div className="maju-empty-state p-5">
                  <p className="text-sm font-black text-slate-800">조건에 맞는 표준 필드가 없습니다.</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">검색어나 필터를 바꿔 다시 확인하세요.</p>
                </div>
              )}
            </div>
          </aside>
        </div>
        <div className="border-t border-slate-200 bg-white px-5 py-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_220px] lg:items-center">
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-950">
                {readyToReview ? "필수 필드 매칭이 완료됐습니다." : "필수 필드를 먼저 연결하세요."}
              </p>
              <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                {readyToReview
                  ? "닫은 뒤 데이터 검수에서 사업자번호, 누락값, 중복 후보를 확인하면 저장 단계로 넘어갈 수 있습니다."
                  : `${missingRequiredFields.map((field) => field.label).join(", ")} 필드가 아직 비어 있습니다.`}
              </p>
            </div>
            <button
              className="maju-button-secondary h-10 border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={readyToReview}
              type="button"
              onClick={() => setFieldFilter("required")}
            >
              필수 필드만 보기
            </button>
            <button
              className="maju-button-secondary h-10 bg-slate-50 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={unmappedColumnCount === 0}
              type="button"
              onClick={() => setColumnFilter("unmapped")}
            >
              미연결 컬럼 {unmappedColumnCount}개
            </button>
            <Button className={readyToReview ? "maju-button-primary h-10" : "maju-button-secondary h-10"} type="button" variant={readyToReview ? "default" : "outline"} onClick={readyToReview ? onDone : onClose}>
              {readyToReview ? "닫고 데이터 검수" : "닫기"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExcelMappingSheetTable({
  fields,
  headers,
  mappedByHeader,
  onHeaderMap,
  rows
}: {
  fields: readonly UploadTemplateField[];
  headers: string[];
  mappedByHeader: Record<string, string>;
  onHeaderMap: (header: string, fieldKey: string) => void;
  rows: RawRow[];
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-white">
      <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-left text-xs">
        <thead className="sticky top-0 z-20 bg-slate-100 text-slate-600 shadow-sm">
          <tr>
            <th className="sticky left-0 z-30 w-14 border-b border-r border-slate-200 bg-slate-100 px-3 py-2.5 font-black">행</th>
            {headers.map((header) => {
              const mappedFieldKey = mappedByHeader[header] || "";
              const mappedField = fields.find((field) => field.key === mappedFieldKey);

              return (
                <th key={header} className="min-w-56 border-b border-r border-slate-200 bg-slate-100 px-2.5 py-2.5 align-top font-black">
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="max-w-40 truncate text-slate-950" title={header}>
                        {header}
                      </span>
                      <Badge className={mappedField ? "bg-blue-100 text-blue-800" : "bg-slate-200 text-slate-600"}>
                        {mappedField ? mappedField.label : "미연결"}
                      </Badge>
                    </div>
                    <select
                      className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      value={mappedFieldKey}
                      onChange={(event) => onHeaderMap(header, event.target.value)}
                    >
                      <option value="">표준 필드 선택</option>
                      {fields.map((field) => (
                        <option key={field.key} value={field.key}>
                          {field.label}
                          {field.required ? " *" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="odd:bg-white even:bg-slate-50/70 hover:bg-blue-50/40">
              <td className="sticky left-0 z-10 border-b border-r border-slate-100 bg-inherit px-3 py-2 font-black text-slate-400">{index + 2}</td>
              {headers.map((header) => {
                const value = String(row[header] ?? "").trim();

                return (
                  <td key={`${index}-${header}`} className="max-w-72 border-b border-r border-slate-100 px-2.5 py-2 font-semibold text-slate-700">
                    <span className={value ? "line-clamp-2" : "text-slate-300"} title={value || "-"}>
                      {value || "-"}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FieldMappingGroup({
  fields,
  fieldMap,
  headers,
  onFieldMap,
  title,
  tone
}: {
  fields: readonly UploadTemplateField[];
  fieldMap: FieldMap;
  headers: string[];
  onFieldMap: (fieldKey: string, header: string) => void;
  title: string;
  tone: "required" | "optional";
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-black text-slate-950">{title}</p>
        <Badge className={tone === "required" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}>{fields.length}개</Badge>
      </div>
      <div className="space-y-2">
        {fields.map((field) => {
          const mappedHeader = fieldMap[field.key] || "";
          return (
            <label key={field.key} className={`block rounded-lg border bg-white p-2.5 shadow-sm ${field.required && !mappedHeader ? "border-amber-200" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-950">
                    {field.label}
                    {field.required ? <span className="ml-1 text-rose-600">*</span> : null}
                  </p>
                  {field.description ? <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{field.description}</p> : null}
                </div>
                <Badge className={mappedHeader ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}>
                  {mappedHeader ? "연결됨" : "미연결"}
                </Badge>
              </div>
              <select
                className="mt-2 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                value={mappedHeader}
                onChange={(event) => onFieldMap(field.key, event.target.value)}
              >
                <option value="">엑셀 헤더 선택</option>
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function FullExcelDataPreview({ headers, rows }: { headers: string[]; rows: RawRow[] }) {
  const [showAllRows, setShowAllRows] = useState(false);

  if (!headers.length || !rows.length) return null;

  const previewLimit = 120;
  const visibleRows = showAllRows ? rows : rows.slice(0, previewLimit);
  const hiddenRows = Math.max(0, rows.length - visibleRows.length);

  return (
    <div className="border-t-8 border-slate-100 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4">
        <div>
          <Badge className="mb-2 bg-slate-900 text-white">2. 전체 데이터 검수</Badge>
          <p className="text-sm font-black text-slate-950">업로드 데이터 전체 보기</p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
            빠른 검수를 위해 먼저 일부 행을 보여주고, 필요하면 전체 행을 펼쳐 누락값과 이상값을 확인하세요.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-slate-100 text-slate-700">
            {visibleRows.length.toLocaleString()}/{rows.length.toLocaleString()}행 · {headers.length.toLocaleString()}컬럼
          </Badge>
          {hiddenRows > 0 ? (
            <button
              type="button"
              onClick={() => setShowAllRows(true)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              전체 {rows.length.toLocaleString()}행 보기
            </button>
          ) : rows.length > previewLimit ? (
            <button
              type="button"
              onClick={() => setShowAllRows(false)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              빠른 검수로 접기
            </button>
          ) : null}
        </div>
      </div>
      <div className="max-h-[680px] overflow-auto bg-white">
        <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600 shadow-sm">
            <tr>
              <th className="sticky left-0 z-20 w-16 border-b border-r border-slate-200 bg-slate-100 px-3 py-3 font-black">행</th>
              {headers.map((header) => (
                <th key={header} className="min-w-40 border-b border-slate-200 px-3 py-3 font-black">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr key={index} className="odd:bg-white even:bg-slate-50/70 hover:bg-blue-50/40">
                <td className="sticky left-0 z-0 border-r border-slate-100 bg-inherit px-3 py-2 font-black text-slate-400">{index + 2}</td>
                {headers.map((header) => {
                  const value = String(row[header] ?? "").trim();
                  return (
                    <td key={`${index}-${header}`} className="max-w-64 border-b border-slate-100 px-3 py-2 font-semibold text-slate-700">
                      <span className={value ? "line-clamp-2" : "text-slate-300"}>{value || "-"}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildSuggestedMapping(fieldMap: FieldMap, fields: readonly UploadTemplateField[], headers: string[]) {
  const nextMap = { ...fieldMap };
  const usedHeaders = new Set(Object.values(nextMap).filter(Boolean));
  let appliedCount = 0;

  fields.forEach((field) => {
    if (nextMap[field.key]) return;

    const terms = [field.key, field.label, ...(field.aliases ?? [])]
      .map(normalizeMappingText)
      .filter(Boolean);
    const matchedHeader = headers.find((header) => {
      if (usedHeaders.has(header)) return false;
      const normalizedHeader = normalizeMappingText(header);
      return terms.some((term) => normalizedHeader === term || normalizedHeader.includes(term) || term.includes(normalizedHeader));
    });

    if (matchedHeader) {
      nextMap[field.key] = matchedHeader;
      usedHeaders.add(matchedHeader);
      appliedCount += 1;
    }
  });

  return { appliedCount, nextMap };
}

function normalizeMappingText(value: string) {
  return value.toLowerCase().replace(/[\s_\-./()[\]{}|:;'"`,]+/g, "");
}
