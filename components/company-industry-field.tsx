"use client";

import { useEffect, useState } from "react";
import { COMPANY_INDUSTRY_OPTIONS, isPresetCompanyIndustry } from "@/domains/organization/company-industry";

const CUSTOM_VALUE = "__custom__";

export function CompanyIndustryField({ label = "업종", onChange, value }: {
  label?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const [customSelected, setCustomSelected] = useState(Boolean(value && !isPresetCompanyIndustry(value)));
  useEffect(() => {
    if (value && !isPresetCompanyIndustry(value)) setCustomSelected(true);
  }, [value]);
  const selected = customSelected ? CUSTOM_VALUE : value;
  return <label className="space-y-1.5 text-sm font-bold text-slate-700">
    <span className="block text-xs font-bold text-muted-foreground">{label}</span>
    <select
      className="maju-input w-full"
      onChange={(event) => {
        const custom = event.target.value === CUSTOM_VALUE;
        setCustomSelected(custom);
        onChange(custom ? "" : event.target.value);
      }}
      value={selected}
    >
      <option value="">선택해주세요</option>
      {COMPANY_INDUSTRY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
      <option value={CUSTOM_VALUE}>직접 입력</option>
    </select>
    {selected === CUSTOM_VALUE ? <input
      aria-label={`${label} 직접 입력`}
      className="maju-input w-full"
      maxLength={40}
      onChange={(event) => onChange(event.target.value)}
      placeholder="업종을 입력해주세요"
      value={value}
    /> : null}
  </label>;
}
