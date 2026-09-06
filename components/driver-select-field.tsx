"use client";

import { useState } from "react";

/**
 * 담당자·배송차 선택 드롭다운. 목록 맨 아래 "+ 새 OO 추가"를 고르면 이름을 입력해 바로 등록합니다.
 * entityLabel로 "담당자"/"배송차" 등 어떤 항목을 고르는 드롭다운인지 문구를 바꿔 재사용합니다.
 * 담당자와 배송차는 서로 다른 값일 수 있어(같은 트럭을 여러 담당자가 나눠 쓰거나, 한 담당자가
 * 상황에 따라 다른 차량을 몰 수 있음) 완전히 독립된 값으로 취급합니다.
 *
 * components/sales-route-map-workspace.tsx(거래처 상세 편집)와
 * app/dashboard/settings/staff-management-panel.tsx(직원 배정 기준 연결)가 함께 씁니다.
 */
export function DriverSelectField({
  compact,
  driverOptions,
  entityLabel = "담당자",
  onAddDriver,
  onChange,
  value
}: {
  readonly compact?: boolean;
  readonly driverOptions: string[];
  readonly entityLabel?: string;
  readonly onAddDriver?: (driverName: string, fuelType?: "gasoline" | "diesel") => Promise<{ ok: boolean; message?: string }>;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  const ADD_NEW = "__add_new_driver__";
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const options = value && !driverOptions.includes(value) ? [value, ...driverOptions] : driverOptions;
  const selectClassName = compact
    ? "h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-teal-300"
    : "h-10 min-w-0 rounded-md border border-slate-200 bg-white px-3 font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100";

  async function handleAddNew() {
    if (!onAddDriver) return;
    setSaving(true);
    setError("");
    const result = await onAddDriver(newName);
    setSaving(false);
    if (!result.ok) {
      setError(result.message || `${entityLabel} 추가에 실패했습니다.`);
      return;
    }
    onChange(newName.trim());
    setIsAddingNew(false);
    setNewName("");
  }

  if (isAddingNew) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            className={compact ? "h-8 w-full rounded-md border border-teal-200 bg-white px-2 text-xs font-bold outline-none focus:border-teal-400" : "h-10 w-full rounded-md border border-teal-200 bg-white px-3 font-bold outline-none focus:border-teal-400"}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={`새 ${entityLabel} 이름`}
            value={newName}
          />
          <button className="maju-button-secondary h-8 shrink-0 px-2 text-xs" disabled={saving} onClick={() => setIsAddingNew(false)} type="button">
            취소
          </button>
          <button className="maju-button-primary h-8 shrink-0 px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60" disabled={saving || !newName.trim()} onClick={handleAddNew} type="button">
            {saving ? "추가 중" : "추가"}
          </button>
        </div>
        {error ? <p className="text-[11px] font-bold text-rose-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <select
      className={selectClassName}
      onChange={(event) => {
        if (event.target.value === ADD_NEW) {
          setIsAddingNew(true);
          return;
        }
        onChange(event.target.value);
      }}
      value={value}
    >
      <option value="">{entityLabel} 미지정</option>
      {options.map((driver) => (
        <option key={driver} value={driver}>
          {driver}
        </option>
      ))}
      {onAddDriver ? <option value={ADD_NEW}>+ 새 {entityLabel} 추가</option> : null}
    </select>
  );
}
