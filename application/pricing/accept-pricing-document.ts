import type {
  PricingAcceptanceCommand,
  PricingAcceptanceRepository,
} from "@/domains/pricing/acceptance-order-link";

const id = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const optionalIds = (command: PricingAcceptanceCommand) => [
  command.actorUserId,
  command.customerId,
  command.leadId,
  command.sendId,
];

export function acceptPricingDocument(
  repository: PricingAcceptanceRepository,
  command: PricingAcceptanceCommand,
) {
  if (
    !id.test(command.companyId) ||
    !id.test(command.documentId) ||
    !id.test(command.documentVersionId) ||
    !id.test(command.idempotencyKey) ||
    optionalIds(command).some((value) => value && !id.test(value)) ||
    command.requestFingerprint.length < 16 ||
    command.requestFingerprint.length > 200
  )
    throw new Error("수락 요청을 확인해 주세요.");
  return repository.accept(command);
}
