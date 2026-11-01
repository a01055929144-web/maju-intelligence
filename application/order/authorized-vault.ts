import { auditPurpose } from "../../domains/order/onboarding-protection";
import type { VaultRecord } from "./onboarding-vault";
export type VerifiedStaff = { companyId: string; userId: string };
export type AuditedRecord = {
  auditId: string;
  actorId: string;
  authorizedAt: string;
  readUntil: string;
  record: VaultRecord;
};
export type AuthorizedVaultPorts = {
  ready: boolean;
  authorize(
    staff: VerifiedStaff,
    recordId: string,
    purpose: string,
  ): Promise<AuditedRecord>;
  readPrivate(objectKey: string): Promise<Uint8Array>;
  decrypt(record: VaultRecord): string;
  now?: () => Date;
};
/** Internal factory only: verified staff scope must be supplied by the server, never a link or request body. */
export function authorizedVault(ports: AuthorizedVaultPorts) {
  return {
    async read(staff: VerifiedStaff, recordId: string, purpose: string) {
      if (!ports.ready)
        throw new Error("자료 보호 연결이 준비되지 않았습니다.");
      const reason = auditPurpose(purpose);
      const approved = await ports.authorize(staff, recordId, reason);
      const clock = ports.now ?? (() => new Date());
      const check = () => {
        const now = clock().getTime(),
          issued = Date.parse(approved.authorizedAt),
          until = Date.parse(approved.readUntil);
        const r = approved.record;
        if (
          !approved.auditId ||
          approved.actorId !== staff.userId ||
          r.id !== recordId ||
          r.companyId !== staff.companyId ||
          r.state !== "available" ||
          ![now, issued, until].every(Number.isFinite) ||
          issued > now ||
          now >= until ||
          until - issued > 5000 ||
          Date.parse(r.expiresAt) < until ||
          !Number.isFinite(Date.parse(r.expiresAt))
        )
          throw new Error("자료 열람 승인이 만료됐습니다.");
        const expected =
          r.kind === "registration"
            ? "verify-registration"
            : r.kind === "entrance"
              ? "delivery-access"
              : r.kind === "loading-photo"
                ? "delivery-location"
                : null;
        if (
          expected !== reason ||
          (r.kind === "entrance" ? !r.envelope : !r.objectKey)
        )
          throw new Error("자료를 열람할 수 없습니다.");
      };
      check();
      const result =
        approved.record.kind === "entrance"
          ? { kind: "entrance" as const, value: ports.decrypt(approved.record) }
          : {
              kind: "file" as const,
              bytes: await ports.readPrivate(approved.record.objectKey!),
            };
      check();
      return result;
    },
  };
}
