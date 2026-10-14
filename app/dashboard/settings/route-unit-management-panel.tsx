"use client";

import { useMemo, useState } from "react";
import { BusFront, Save, Shuffle, Truck } from "lucide-react";
import type { DeliveryRouteUnit } from "@/domains/delivery/route-unit";
import type { VehicleMaster } from "@/domains/delivery/vehicle-master";
import type { CompanyStaffMemberOption, DeliveryTerritoryItem } from "@/lib/store";

type Draft = {
  id?: string;
  territoryId: string;
  name: string;
  currentVehicleId: string;
  defaultDriverStaffMemberId: string;
  isActive: boolean;
  memo: string;
};

const EMPTY_DRAFT: Draft = {
  territoryId: "",
  name: "",
  currentVehicleId: "",
  defaultDriverStaffMemberId: "",
  isActive: true,
  memo: ""
};

const fuelLabels: Record<VehicleMaster["fuelType"], string> = {
  diesel: "경유", electric: "전기", gasoline: "휘발유", hybrid: "하이브리드", lpg: "LPG"
};
const statusLabels: Record<VehicleMaster["status"], string> = { active: "운행", inactive: "미사용", maintenance: "정비" };

export function RouteUnitManagementPanel({
  canManage,
  initialRouteUnits,
  initialStaff,
  initialTerritories,
  initialVehicles
}: {
  canManage: boolean;
  initialRouteUnits: DeliveryRouteUnit[];
  initialStaff: CompanyStaffMemberOption[];
  initialTerritories: DeliveryTerritoryItem[];
  initialVehicles: VehicleMaster[];
}) {
  const [routeUnits, setRouteUnits] = useState(initialRouteUnits);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const assignedUnitByVehicleId = useMemo(
    () => new Map(routeUnits.filter((unit) => unit.isActive && unit.currentVehicleId).map((unit) => [unit.currentVehicleId!, unit.name])),
    [routeUnits]
  );

  function open(unit: DeliveryRouteUnit) {
    setDraft({
      id: unit.id,
      territoryId: unit.territoryId,
      name: unit.name,
      currentVehicleId: unit.currentVehicleId || "",
      defaultDriverStaffMemberId: unit.defaultDriverStaffMemberId || "",
      isActive: unit.isActive,
      memo: unit.memo || ""
    });
    setMessage("");
  }

  async function submit(moveVehicle = false) {
    if (!draft.name.trim() || !draft.territoryId || saving) return;
    setSaving(true);
    setMessage("호차 정보를 저장하는 중입니다...");
    try {
      const response = await fetch("/api/customer/route-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, moveVehicle })
      });
      const payload = await response.json().catch(() => null);
      if (response.status === 409 && payload?.conflict?.name && !moveVehicle) {
        setSaving(false);
        if (window.confirm(payload.message || `${payload.conflict.name}에서 사용 중입니다. 차량을 옮기시겠습니까?`)) {
          await submit(true);
        } else {
          setMessage("차량 이동을 취소했습니다.");
        }
        return;
      }
      if (!response.ok) throw new Error(payload?.message || "호차를 저장하지 못했습니다.");
      setRouteUnits(Array.isArray(payload?.routeUnits) ? payload.routeUnits : []);
      setDraft(EMPTY_DRAFT);
      setMessage(moveVehicle ? "차량을 기존 호차에서 옮기고 저장했습니다." : "호차를 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "호차를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="maju-section-card">
      <div className="maju-card-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-teal-700"><BusFront className="h-4 w-4" /> 호차 관리</p>
          <h2 className="text-2xl font-black text-slate-950">권역의 운행 단위와 현재 차량</h2>
          <p className="mt-2 text-sm font-semibold text-slate-500">호차는 권역과 기사를 묶고, 실물 차량은 필요할 때 교체합니다. 차량을 바꿔도 거래처 배정과 오늘 코스는 바뀌지 않습니다.</p>
        </div>
        <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700" disabled={!canManage} onClick={() => setDraft(EMPTY_DRAFT)} type="button">새 호차</button>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
        <div className="space-y-2">
          {routeUnits.length ? routeUnits.map((unit) => (
            <button className={`w-full rounded-xl border p-4 text-left transition ${draft.id === unit.id ? "border-teal-400 bg-teal-50" : "border-slate-200 bg-white hover:border-slate-300"}`} key={unit.id} onClick={() => open(unit)} type="button">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-slate-950">{unit.name}</strong>
                <span className={`text-xs font-black ${unit.isActive ? "text-emerald-700" : "text-slate-400"}`}>{unit.isActive ? "활성" : "비활성"}</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-600">{unit.territoryName} · {unit.defaultDriverName || "기사 미지정"}</p>
              <p className="mt-1 text-xs text-slate-500">{unit.currentVehiclePlateNumber ? `${unit.currentVehiclePlateNumber} · ${unit.currentVehicleName || "차량"}` : "현재 차량 미지정"}</p>
            </button>
          )) : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">등록된 호차가 없습니다.</div>}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold text-slate-700">권역
              <select className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5" disabled={!canManage} onChange={(event) => setDraft({ ...draft, territoryId: event.target.value })} value={draft.territoryId}>
                <option value="">권역 선택</option>
                {initialTerritories.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-bold text-slate-700">호차명
              <input className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5" disabled={!canManage} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="예: 1호차" value={draft.name} />
            </label>
            <label className="text-sm font-bold text-slate-700">기본 기사
              <select className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5" disabled={!canManage} onChange={(event) => setDraft({ ...draft, defaultDriverStaffMemberId: event.target.value })} value={draft.defaultDriverStaffMemberId}>
                <option value="">기사 미지정</option>
                {initialStaff.map((staff) => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-bold text-slate-700">현재 차량
              <select className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5" disabled={!canManage} onChange={(event) => setDraft({ ...draft, currentVehicleId: event.target.value })} value={draft.currentVehicleId}>
                <option value="">차량 미지정</option>
                {initialVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plateNumber} · {vehicle.name} · {statusLabels[vehicle.status]}</option>)}
              </select>
            </label>
          </div>
          <label className="mt-3 block text-sm font-bold text-slate-700">메모
            <textarea className="mt-2 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5" disabled={!canManage} onChange={(event) => setDraft({ ...draft, memo: event.target.value })} placeholder="대체 운행, 권역 특이사항 등" value={draft.memo} />
          </label>
          <label className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-700">
            <input checked={draft.isActive} disabled={!canManage} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} type="checkbox" /> 활성 호차
          </label>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <p aria-live="polite" className={`text-sm font-semibold ${message.includes("못") || message.includes("아닙니다") ? "text-rose-700" : "text-slate-600"}`}>{message}</p>
            <button className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={!canManage || saving || !draft.name.trim() || !draft.territoryId} onClick={() => void submit()} type="button"><Save className="mr-1 inline h-4 w-4" />{saving ? "저장 중" : "호차 저장"}</button>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 bg-slate-50/70 p-4">
        <div className="mb-3 flex items-center gap-2"><Truck className="h-4 w-4 text-slate-500" /><h3 className="text-sm font-black text-slate-900">차량 마스터 · 번호판 기준 실물 장비</h3></div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {initialVehicles.map((vehicle) => (
            <div className="rounded-lg border border-slate-200 bg-white p-3" key={vehicle.id}>
              <div className="flex items-start justify-between gap-2"><strong className="text-base text-slate-950">{vehicle.plateNumber}</strong><span className="text-xs font-bold text-slate-500">{statusLabels[vehicle.status]}</span></div>
              <p className="mt-1 text-sm font-semibold text-slate-600">{vehicle.name} · {fuelLabels[vehicle.fuelType]}</p>
              <p className="mt-2 flex items-center gap-1 text-xs font-bold text-teal-700"><Shuffle className="h-3.5 w-3.5" />{assignedUnitByVehicleId.get(vehicle.id) ? `현재 ${assignedUnitByVehicleId.get(vehicle.id)} 배정` : "현재 호차 미배정"}</p>
              {/^(?:제?\s*)?\d+\s*호차$/.test(vehicle.name.trim()) ? <p className="mt-2 text-xs text-amber-700">차량명은 실물 장비 이름입니다. “1호차” 같은 운행 단위명은 위 호차 관리에서 지정하세요.</p> : null}
            </div>
          ))}
          {!initialVehicles.length ? <p className="text-sm text-slate-500">등록된 차량 마스터가 없습니다. 지도 홈의 차량 마스터에서 번호판 중심으로 차량을 먼저 등록하세요.</p> : null}
        </div>
      </div>
    </section>
  );
}

