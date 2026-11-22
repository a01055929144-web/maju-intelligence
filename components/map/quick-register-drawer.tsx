"use client";
// D-6 ③: 지도 파일에서 분리한 빠른 등록 서랍(화면·동작 변화 0).
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/state";
import { useState } from "react";
import { DriverSelectField } from "@/components/driver-select-field";
import { Check, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { type ExternalBusinessResult } from "@/components/map/use-business-search";
import type { PossibleDuplicateCustomer } from "@/lib/store";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes-warning";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { formatPhoneNumber } from "@/lib/phone";
import { normalizePhoneNumber } from "@/components/map/map-place-helpers";

const CustomerAttachmentUploadPanel = dynamic(
  () => import("@/components/customer-attachment-upload-panel").then((module) => module.CustomerAttachmentUploadPanel),
  { loading: () => <LoadingState label="첨부 기능을 준비하는 중입니다." /> }
);

export function QuickRegisterDrawer({
  driverOptions,
  onAddDriver,
  onAddVehicle,
  onClose,
  onRegistered,
  result,
  vehicleOptions
}: {
  driverOptions?: string[];
  onAddDriver?: (driverName: string, fuelType?: "gasoline" | "diesel") => Promise<{ ok: boolean; message?: string }>;
  onAddVehicle?: (vehicleName: string) => Promise<{ ok: boolean; message?: string }>;
  onClose: () => void;
  onRegistered: () => void;
  result: ExternalBusinessResult;
  vehicleOptions?: string[];
}) {
  const [customerName, setCustomerName] = useState(result.name);
  const [address, setAddress] = useState(result.roadAddress || result.address);
  const [phone, setPhone] = useState(formatPhoneNumber(result.phone));
  const [industry, setIndustry] = useState(result.industry);
  const [deliveryManager, setDeliveryManager] = useState("");
  const [deliveryVehicle, setDeliveryVehicle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [createdCustomer, setCreatedCustomer] = useState<{ id: string; name: string; assignmentNotice?: string } | null>(null);
  // 2026-08-27 피드백("중복값 입력되지 않게 만들어줘") 대응: 서버가 상호명이 같은 기존 거래처를
  // 발견하면 바로 저장하지 않고 이 상태에 그 목록을 담아 확인창을 띄웁니다. 사용자가 "그래도 등록"을
  // 선택해야만 confirmDuplicate: true로 다시 요청을 보내 실제로 저장합니다.
  const [duplicateMatches, setDuplicateMatches] = useState<PossibleDuplicateCustomer[] | null>(null);
  // 2026-08-31 에러 처리/복원력 감사 후속: 카카오 검색 결과로 채워진 값을 그대로 두거나(=아직
  // 손대지 않음) 이미 등록을 마쳤다면 이탈 경고를 띄우지 않고, 사용자가 실제로 뭔가 고치거나
  // 담당자/배송차를 지정했을 때만(=저장 안 하고 나가면 다시 입력해야 함) 경고합니다.
  const isDraftDirty =
    !createdCustomer &&
    (customerName !== (result.name || "") ||
      address !== (result.roadAddress || result.address || "") ||
      phone !== (result.phone || "") ||
      industry !== (result.industry || "") ||
      Boolean(deliveryManager) ||
      Boolean(deliveryVehicle));
  useUnsavedChangesWarning(isDraftDirty);

  async function saveCustomer(confirmDuplicate = false) {
    if (!customerName.trim() || isSaving) return;

    setIsSaving(true);
    setSaveError("");

    try {
      const companyId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("companyId") : null;
      const response = await fetchWithTimeout("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          businessStatus: "확인 필요",
          companyId: companyId || undefined,
          confirmDuplicate,
          customerName,
          deliveryManager: deliveryManager || undefined,
          deliveryVehicle: deliveryVehicle || undefined,
          industry: industry || "미분류",
          kakaoPlaceUrl: result.kakaoPlaceUrl,
          phone: normalizePhoneNumber(phone),
          validateBusinessNumber: false
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "거래처 등록에 실패했습니다.");
      if (payload?.possibleDuplicate) {
        setDuplicateMatches(payload.duplicateMatches || []);
        return;
      }

      const customerId = String(payload?.customer?.id || "");
      if (!customerId) throw new Error("거래처는 저장됐지만 ID를 확인하지 못했습니다. 거래처 관리에서 확인해주세요.");

      setCreatedCustomer({ id: customerId, name: customerName, assignmentNotice: payload?.assignmentNotice });
      onRegistered();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "거래처 등록에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button aria-label="빠른 등록 닫기" className="fixed inset-0 z-40 bg-slate-950/45" onClick={onClose} type="button" />
      <aside className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-[480px] flex-col border-l border-slate-200 bg-white shadow-2xl">
        <header className="maju-card-header border-b px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-black text-teal-700">지도 검색 · 빠른 등록</p>
              <h3 className="mt-1 truncate text-xl font-black text-slate-950">{createdCustomer ? `${createdCustomer.name} 등록 완료` : "거래처로 등록"}</h3>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {createdCustomer ? "서류를 업로드하면 바로 사용할 수 있습니다." : "이름과 주소만 있으면 바로 저장할 수 있습니다."}
              </p>
            </div>
            <button
              aria-label="닫기"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-rose-50 hover:text-rose-700"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-50 px-4 py-4">
          {createdCustomer ? (
            <div className="space-y-4">
              <CustomerAttachmentUploadPanel customerId={createdCustomer.id} customerName={createdCustomer.name} />
              {createdCustomer.assignmentNotice ? (
                <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-bold text-teal-800">
                  {createdCustomer.assignmentNotice}
                </div>
              ) : null}
              <button className="maju-button-primary flex h-11 w-full items-center justify-center gap-2 text-sm" onClick={onClose} type="button">
                <Check className="h-4 w-4" />
                완료
              </button>
            </div>
          ) : (
            <div className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-black text-slate-500">상호명 (필수)</span>
                <input
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                  onChange={(event) => setCustomerName(event.target.value)}
                  value={customerName}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-black text-slate-500">주소</span>
                <input
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                  onChange={(event) => setAddress(event.target.value)}
                  value={address}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-black text-slate-500">연락처</span>
                <input
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                  onChange={(event) => setPhone(formatPhoneNumber(event.target.value))}
                  value={phone}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-black text-slate-500">업종</span>
                <input
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                  onChange={(event) => setIndustry(event.target.value)}
                  value={industry}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1.5">
                  <span className="text-xs font-black text-slate-500">담당자</span>
                  <DriverSelectField driverOptions={driverOptions || []} onAddDriver={onAddDriver} onChange={setDeliveryManager} value={deliveryManager} />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-black text-slate-500">배송차</span>
                  <DriverSelectField
                    driverOptions={vehicleOptions || []}
                    entityLabel="배송차"
                    onAddDriver={onAddVehicle}
                    onChange={setDeliveryVehicle}
                    value={deliveryVehicle}
                  />
                </label>
              </div>
              <p className="rounded-md bg-blue-50 px-3 py-2 text-xs font-bold leading-5 text-blue-800">
                사업자등록번호는 지금 없어도 됩니다. 저장 후 사업자등록증을 업로드해 보완할 수 있습니다.
              </p>
              {saveError ? <p className="text-xs font-bold text-rose-600">{saveError}</p> : null}
              <button
                className="maju-button-primary flex h-11 w-full items-center justify-center gap-2 text-sm disabled:opacity-60"
                disabled={!customerName.trim() || isSaving}
                onClick={() => saveCustomer()}
                type="button"
              >
                {isSaving ? "저장 중" : "거래처로 등록"}
              </button>
            </div>
          )}
        </div>
      </aside>
      {duplicateMatches ? (
        <ConfirmDialog
          cancelLabel="취소"
          confirmLabel="그래도 등록"
          message={`이름이 같은 거래처가 이미 있습니다.\n${duplicateMatches.map((match) => `· ${match.customerName}${match.address ? ` (${match.address})` : ""}`).join("\n")}\n\n그래도 새 거래처로 등록하시겠습니까?`}
          onCancel={() => setDuplicateMatches(null)}
          onConfirm={() => {
            setDuplicateMatches(null);
            saveCustomer(true);
          }}
          title="중복 의심 거래처"
          tone="default"
        />
      ) : null}
    </>
  );
}
