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
  rows
}: {
  fields: readonly UploadTemplateField[];
  fieldMap: FieldMap;
  headers: string[];
  onMap: (map: FieldMap) => void;
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

  return (
    <div className="overflow-hidden rounded-md border border-blue-200 bg-white shadow-sm">
      <div className="border-b border-blue-100 bg-blue-50/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge className="mb-2 bg-blue-700 text-white">3-1 헤더 매칭</Badge>
            <p className="flex items-center gap-2 text-sm font-black text-slate-950">
              <FileSpreadsheet className="h-4 w-4 text-blue-700" />
              ERP 엑셀 컬럼을 MAJU 표준 필드로 연결
            </p>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
              업로드한 ERP 엑셀의 실제 컬럼과 샘플값을 보고 MAJU 표준 필드에 연결합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={missingRequiredFields.length ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>
              {missingRequiredFields.length ? `필수 ${missingRequiredFields.length}개 남음` : "필수 완료"}
            </Badge>
            <Button className="h-9 bg-blue-700 text-white hover:bg-blue-800" size="sm" type="button" onClick={() => setIsWorkspaceOpen(true)}>
              큰 화면에서 매핑
            </Button>
          </div>
        </div>
        {missingRequiredFields.length ? (
          <p className="mt-2 rounded-md bg-white px-3 py-2 text-xs font-black leading-5 text-amber-800">
            남은 필수값: {missingRequiredFields.map((field) => field.label).join(", ")}
          </p>
        ) : null}
      </div>
      <div className="max-h-[520px] overflow-auto bg-white">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600 shadow-sm">
            <tr>
              <th className="w-[24%] border-b border-slate-200 px-4 py-3 font-black">엑셀 헤더</th>
              <th className="w-[42%] border-b border-slate-200 px-4 py-3 font-black">샘플값</th>
              <th className="w-[34%] border-b border-slate-200 px-4 py-3 font-black">MAJU 표준 필드</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((header) => {
              const mappedFieldKey = mappedByHeader[header] || "";
              const mappedField = fields.find((field) => field.key === mappedFieldKey);
              const samples = rows
                .slice(0, 4)
                .map((row) => String(row[header] ?? "").trim())
                .filter(Boolean);

              return (
                <tr key={header} className="border-t border-slate-100 align-top transition hover:bg-blue-50/30">
                  <td className="px-4 py-3">
                    <p className="font-black text-slate-950">{header}</p>
                    {mappedField ? (
                      <Badge className={mappedField.required ? "mt-2 bg-blue-100 text-blue-800" : "mt-2 bg-slate-100 text-slate-700"}>
                        {mappedField.required ? "필수 연결" : "선택 연결"}
                      </Badge>
                    ) : (
                      <Badge className="mt-2 bg-slate-100 text-slate-500">미사용</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {samples.length ? (
                        samples.map((sample, index) => (
                          <span key={`${header}-${index}`} className="max-w-[220px] truncate rounded-md bg-slate-50 px-2 py-1 font-bold text-slate-700">
                            {sample}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-md bg-slate-50 px-2 py-1 font-bold text-slate-400">빈 값</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
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
                    {mappedField?.description ? <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">{mappedField.description}</p> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
          onFieldMap={updateFieldMapping}
          onHeaderMap={updateHeaderMapping}
        />
      ) : null}
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
  onFieldMap: (fieldKey: string, header: string) => void;
  onHeaderMap: (header: string, fieldKey: string) => void;
  rows: RawRow[];
}) {
  const [columnFilter, setColumnFilter] = useState<"all" | "mapped" | "unmapped">("all");
  const [columnQuery, setColumnQuery] = useState("");
  const [fieldFilter, setFieldFilter] = useState<"all" | "required" | "mapped" | "unmapped">("all");
  const [fieldQuery, setFieldQuery] = useState("");
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

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/55 p-3 backdrop-blur-sm md:p-6">
      <div className="mx-auto flex h-full max-w-[1680px] flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <Badge className="mb-2 bg-blue-700 text-white">매핑 전용 화면</Badge>
            <h3 className="text-xl font-black text-slate-950">엑셀 컬럼과 MAJU 표준 필드 연결</h3>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">좌측 엑셀 원본 표를 확인하고, 컬럼별로 알맞은 표준 필드를 선택하세요.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge className="bg-slate-900 text-white">전체 {fields.length}개 필드 중 {mappedCount}개 연결</Badge>
              <Badge className={missingRequiredFields.length ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>
                필수 {requiredMappedCount}/{requiredFields.length}
              </Badge>
              <Badge className="bg-blue-100 text-blue-800">진행률 {completionRate}%</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={missingRequiredFields.length ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>
              {missingRequiredFields.length ? `필수 ${missingRequiredFields.length}개 남음` : "필수 매핑 완료"}
            </Badge>
            <Button type="button" variant="outline" onClick={onClose}>
              닫기
            </Button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_500px]">
          <section className="flex min-h-0 flex-col border-r border-slate-200 bg-slate-50/50">
            <div className="border-b border-slate-200 bg-white px-5 py-3">
              <p className="text-sm font-black text-slate-950">좌측: 업로드 엑셀 원본 전체 보기</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {rows.length.toLocaleString()}행 · {headers.length.toLocaleString()}컬럼을 그대로 확인하면서 컬럼별 표준 필드를 지정합니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-5 py-3">
              <input
                className="h-10 min-w-60 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                value={columnQuery}
                onChange={(event) => setColumnQuery(event.target.value)}
                placeholder="엑셀 컬럼명 검색..."
              />
              {[
                ["all", "전체"],
                ["unmapped", "미연결"],
                ["mapped", "연결됨"]
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={`h-10 rounded-md border px-3 text-xs font-black transition ${
                    columnFilter === value ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                  type="button"
                  onClick={() => setColumnFilter(value as "all" | "mapped" | "unmapped")}
                >
                  {label}
                </button>
              ))}
              <Badge className="bg-slate-100 text-slate-700">{filteredHeaders.length}/{headers.length}컬럼</Badge>
            </div>
            <ExcelMappingSheetTable fields={fields} headers={filteredHeaders} mappedByHeader={mappedByHeader} rows={rows} onHeaderMap={onHeaderMap} />
          </section>

          <aside className="flex min-h-0 flex-col bg-white">
            <div className="border-b border-slate-200 bg-white px-5 py-3">
              <p className="text-sm font-black text-slate-950">우측: MAJU 표준 필드 설정</p>
              <p className="mt-1 text-xs font-bold text-slate-500">필수값부터 연결하면 저장 가능 여부가 바로 갱신됩니다.</p>
            </div>
            <div className="space-y-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <input
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                value={fieldQuery}
                onChange={(event) => setFieldQuery(event.target.value)}
                placeholder="표준 필드 검색..."
              />
              <div className="grid grid-cols-4 gap-2">
                {[
                  ["all", "전체"],
                  ["required", "필수"],
                  ["unmapped", "미연결"],
                  ["mapped", "연결됨"]
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={`h-9 rounded-md border px-2 text-xs font-black transition ${
                      fieldFilter === value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
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
                <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                  <p className="text-sm font-black text-slate-800">조건에 맞는 표준 필드가 없습니다.</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">검색어나 필터를 바꿔 다시 확인하세요.</p>
                </div>
              )}
            </div>
          </aside>
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
            <th className="sticky left-0 z-30 w-16 border-b border-r border-slate-200 bg-slate-100 px-3 py-3 font-black">행</th>
            {headers.map((header) => {
              const mappedFieldKey = mappedByHeader[header] || "";
              const mappedField = fields.find((field) => field.key === mappedFieldKey);

              return (
                <th key={header} className="min-w-56 border-b border-r border-slate-200 bg-slate-100 px-3 py-3 align-top font-black">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="max-w-40 truncate text-slate-950" title={header}>
                        {header}
                      </span>
                      <Badge className={mappedField ? "bg-blue-100 text-blue-800" : "bg-slate-200 text-slate-600"}>
                        {mappedField ? mappedField.label : "미연결"}
                      </Badge>
                    </div>
                    <select
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
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
                  <td key={`${index}-${header}`} className="max-w-72 border-b border-r border-slate-100 px-3 py-2 font-semibold text-slate-700">
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
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-black text-slate-950">{title}</p>
        <Badge className={tone === "required" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}>{fields.length}개</Badge>
      </div>
      <div className="space-y-2">
        {fields.map((field) => {
          const mappedHeader = fieldMap[field.key] || "";
          return (
            <label key={field.key} className={`block rounded-md border bg-white p-3 ${field.required && !mappedHeader ? "border-amber-200" : "border-slate-200"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-950">
                    {field.label}
                    {field.required ? <span className="ml-1 text-rose-600">*</span> : null}
                  </p>
                  {field.description ? <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{field.description}</p> : null}
                </div>
                <Badge className={mappedHeader ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}>
                  {mappedHeader ? "연결됨" : "미연결"}
                </Badge>
              </div>
              <select
                className="mt-3 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
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
  if (!headers.length || !rows.length) return null;

  return (
    <div className="border-t-8 border-slate-100 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4">
        <div>
          <Badge className="mb-2 bg-slate-900 text-white">3-2 전체 데이터 검수</Badge>
          <p className="text-sm font-black text-slate-950">업로드 데이터 전체 보기</p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
            엑셀의 전체 행을 그대로 보여줍니다. 세로·가로 스크롤로 누락값과 이상값을 확인하세요.
          </p>
        </div>
        <Badge className="bg-slate-100 text-slate-700">{rows.length.toLocaleString()}행 · {headers.length.toLocaleString()}컬럼</Badge>
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
            {rows.map((row, index) => (
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
