import {
  assertReadable,
  auditPurpose,
  type ProtectedRecord,
  type VaultScope,
} from "../../domains/order/onboarding-protection";
export type VaultEnvelope = {
  version: 1;
  keyId: string;
  iv: string;
  tag: string;
  ciphertext: string;
};
export type VaultRecord = ProtectedRecord & {
  envelope?: VaultEnvelope;
  objectKey?: string;
};
export type VaultPorts = {
  find(companyId: string, recordId: string): Promise<VaultRecord | null>;
  assignedDriver(
    companyId: string,
    customerId: string,
    actorId: string,
    kstDay: string,
  ): Promise<boolean>;
  audit(event: {
    companyId: string;
    customerId: string;
    recordId: string;
    actorId: string;
    purpose: string;
    occurredAt: string;
  }): Promise<void>;
  readPrivate(objectKey: string): Promise<Uint8Array>;
  decrypt(envelope: VaultEnvelope, record: ProtectedRecord): string;
};
/** No HTTP binding exists. Scope must come from verified staff auth, never public link/body fields. */
export function onboardingVault(ports: VaultPorts) {
  return {
    async read(
      scope: VaultScope,
      recordId: string,
      purpose: string,
      now = new Date(),
    ) {
      const reason = auditPurpose(purpose);
      const record = await ports.find(scope.companyId, recordId);
      if (!record || record.id !== recordId)
        throw new Error("자료를 열람할 수 없습니다.");
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);
      const assigned =
        scope.role === "driver" &&
        scope.companyId === record.companyId &&
        record.kind !== "registration"
          ? await ports.assignedDriver(
              scope.companyId,
              record.customerId,
              scope.actorId,
              day,
            )
          : false;
      assertReadable(scope, record, assigned, now);
      const expected =
        record.kind === "registration"
          ? "verify-registration"
          : record.kind === "entrance"
            ? "delivery-access"
            : "delivery-location";
      if (
        reason !== expected ||
        (record.kind === "entrance" ? !record.envelope : !record.objectKey)
      )
        throw new Error("자료를 열람할 수 없습니다.");
      // Failure to persist the audit must block both object access and decryption.
      await ports.audit({
        companyId: record.companyId,
        customerId: record.customerId,
        recordId: record.id,
        actorId: scope.actorId,
        purpose: reason,
        occurredAt: now.toISOString(),
      });
      return record.kind === "entrance"
        ? {
            kind: "entrance" as const,
            value: ports.decrypt(record.envelope!, record),
          }
        : {
            kind: "file" as const,
            bytes: await ports.readPrivate(record.objectKey!),
          };
    },
  };
}
