export type ProtectedKind = "registration" | "loading-photo" | "entrance";
export type VaultScope = {
  companyId: string;
  actorId: string;
  role: "owner" | "manager" | "driver" | "sales";
};
export type ProtectedRecord = {
  id: string;
  companyId: string;
  customerId: string;
  kind: ProtectedKind;
  state: "quarantine" | "available" | "deleting" | "deleted";
  collectedAt: string;
  expiresAt: string;
};
export function assertReadable(
  scope: VaultScope,
  record: ProtectedRecord,
  assigned: boolean,
  now: Date,
) {
  const collected = Date.parse(record.collectedAt),
    expires = Date.parse(record.expiresAt);
  if (
    !Number.isFinite(now.getTime()) ||
    !scope.actorId ||
    scope.companyId !== record.companyId ||
    record.state !== "available" ||
    !Number.isFinite(collected) ||
    !Number.isFinite(expires) ||
    collected > now.getTime() ||
    expires <= now.getTime() ||
    expires <= collected ||
    expires - collected > 30 * 86400000 ||
    !(
      scope.role === "owner" ||
      scope.role === "manager" ||
      (scope.role === "driver" && record.kind !== "registration" && assigned)
    )
  )
    throw new Error("자료를 열람할 수 없습니다.");
}
export function auditPurpose(value: string) {
  if (
    !["verify-registration", "delivery-access", "delivery-location"].includes(
      value,
    )
  )
    throw new Error("열람 목적을 확인해 주세요.");
  return value;
}
export function checkProtectedFile(
  kind: Exclude<ProtectedKind, "entrance">,
  mime: string,
  bytes: Uint8Array,
) {
  const pdf =
    bytes.length >= 5 &&
    String.fromCharCode.apply(null, Array.from(bytes.slice(0, 5))) === "%PDF-";
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const valid =
    (mime === "application/pdf" && pdf && kind === "registration") ||
    (mime === "image/png" && png) ||
    (mime === "image/jpeg" && jpeg);
  if (
    !valid ||
    !bytes.length ||
    bytes.length > (mime === "application/pdf" ? 10 : 5) * 1024 * 1024
  )
    throw new Error("파일 형식과 크기를 확인해 주세요.");
  // Intake validation only. The private object remains quarantined until scanning/sanitizing succeeds.
}
