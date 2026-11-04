"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { KakaoAddressMap, type KakaoSalesAreaStat } from "@/components/kakao-address-map";
import { isSalesAreaCovered, KOREAN_ADMINISTRATIVE_AREAS, KOREAN_GENERAL_GU_AREAS, KOREAN_PROVINCES } from "@/lib/korean-administrative-areas";

/**
 * 11/4: 지역 고르기 공용 — 영업 정보의 지도·시군구 체크와 같은 방식.
 * 배송 지역(회사 정보 › 배송), 권역·호차의 포함 시·군·구를 글자로 입력하지 않고 고릅니다.
 * value 는 '서울특별시 강남구' 같은 표준 이름 배열입니다. 저장은 부모가 합니다.
 */
export function RegionPicker({
  disabled = false,
  onChange,
  taken,
  title = "지역 선택",
  value
}: {
  readonly disabled?: boolean;
  readonly onChange: (next: string[]) => void;
  /** 다른 곳(예: 다른 권역)이 이미 쓰는 지역 → 이름 */
  readonly taken?: ReadonlyMap<string, string>;
  readonly title?: string;
  readonly value: readonly string[];
}) {
  const [province, setProvince] = useState(() => KOREAN_PROVINCES.find((item) => value.some((area) => area.startsWith(item))) || "서울특별시");
  const [stats, setStats] = useState<KakaoSalesAreaStat[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/leads/permits/sales-area-stats?province=${encodeURIComponent(province)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => { if (active) setStats(Array.isArray(payload?.stats) ? payload.stats : []); })
      .catch(() => { if (active) setStats([]); });
    return () => { active = false; };
  }, [province]);

  const statsByArea = useMemo(() => new Map(stats.map((item) => [item.administrativeArea, item])), [stats]);
  const provinceSelected = value.includes(province);
  const rows = useMemo(() => (KOREAN_ADMINISTRATIVE_AREAS[province] || [])
    .filter((district) => !query.trim() || district.includes(query.trim()))
    .map((district) => {
      const parent = `${province} ${district}`;
      return { district, generalGus: KOREAN_GENERAL_GU_AREAS[parent] || [], parent };
    }), [province, query]);

  function toggle(area: string, checked: boolean) {
    if (disabled) return;
    if (checked) {
      // 더 넓은 지역을 고르면 그 안의 세부 지역은 정리합니다.
      onChange([...value.filter((item) => !item.startsWith(`${area} `)), area]);
    } else {
      onChange(value.filter((item) => item !== area));
    }
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-black text-slate-700">{title} {value.length}곳</span>
        {value.map((area) => (
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800" key={area}>
            {area}
            {!disabled ? <button aria-label={`${area} 빼기`} onClick={() => toggle(area, false)} type="button"><X className="h-3 w-3" /></button> : null}
          </span>
        ))}
        {!value.length ? <span className="text-xs font-semibold text-amber-700">지도나 목록에서 골라 주세요.</span> : null}
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <KakaoAddressMap
            mapClassName="h-[280px] rounded-none border-0 sm:h-[340px]"
            markers={[]}
            salesAreaBoundary={{
              canManage: !disabled,
              metric: "customers",
              onToggle: (area) => { if (!taken?.has(area)) toggle(area, !isSalesAreaCovered(area, value)); },
              province,
              selectedAreas: [...value],
              stats
            }}
            showList={false}
          />
          <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-500">경계를 눌러 넣고 빼기 · 진할수록 거래처가 많은 지역</p>
        </div>
        <div className="min-w-0 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
          <div className="flex gap-2">
            <select aria-label="시·도" className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold" onChange={(event) => setProvince(event.target.value)} value={province}>
              {KOREAN_PROVINCES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <input aria-label="시·군·구 찾기" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="구·시·군 찾기" value={query} />
          </div>
          <div className="grid max-h-[300px] gap-x-3 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1.5 sm:grid-cols-2">
            <Check checked={provinceSelected} disabled={disabled} label={`${province} 전체`} onChange={(checked) => toggle(province, checked)} wide />
            {rows.map((row) => (
              <div className={row.generalGus.length ? "sm:col-span-2" : ""} key={row.parent}>
                <Check
                  checked={provinceSelected || value.includes(row.parent)}
                  disabled={disabled || provinceSelected || Boolean(taken?.has(row.parent))}
                  label={row.generalGus.length ? `${row.district} 전체` : row.district}
                  note={taken?.get(row.parent) ? `${taken.get(row.parent)} 사용 중` : statsByArea.get(row.parent)?.customerCount ? `거래처 ${statsByArea.get(row.parent)!.customerCount}` : ""}
                  onChange={(checked) => toggle(row.parent, checked)}
                />
                {row.generalGus.map((gu) => {
                  const area = `${row.parent} ${gu}`;
                  return <div className="pl-5" key={area}><Check checked={provinceSelected || value.includes(row.parent) || value.includes(area)} disabled={disabled || provinceSelected || value.includes(row.parent) || Boolean(taken?.has(area))} label={gu} note={taken?.get(area) ? `${taken.get(area)} 사용 중` : ""} onChange={(checked) => toggle(area, checked)} /></div>;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Check({ checked, disabled, label, note, onChange, wide }: { checked: boolean; disabled: boolean; label: string; note?: string; onChange: (checked: boolean) => void; wide?: boolean }) {
  return (
    <label className={`flex min-h-9 items-center gap-2 rounded-md px-2 py-1 ${wide ? "sm:col-span-2" : ""} ${disabled ? "opacity-60" : "cursor-pointer hover:bg-teal-50"}`}>
      <input checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <span className="min-w-0 flex-1 text-xs font-bold text-slate-800">{label}</span>
      {note ? <span className="shrink-0 text-[10px] font-semibold text-slate-500">{note}</span> : null}
    </label>
  );
}
