import { createHash } from "crypto";
import type {
  PricingAcceptanceRepository,
  PricingAcceptanceResult,
  PricingAcceptanceVia,
} from "../../domains/pricing/acceptance-order-link";
import { acceptPricingDocument } from "./accept-pricing-document";

export type SharedPricingAcceptanceInput = {
  customerProfile?: Record<string, unknown>;
  idempotencyKey: string;
};

export type VerifiedSharedPricingAcceptance = {
  acceptedVia: PricingAcceptanceVia;
  actorKey?: string;
  actorUserId?: string;
  companyId: string;
  customerId?: string;
  customerProfile?: Record<string, unknown>;
  documentId: string;
  documentVersionId: string;
  leadId: string;
  sendId: string;
};

function fingerprint(context: VerifiedSharedPricingAcceptance, input: SharedPricingAcceptanceInput) {
  return createHash("sha256").update(JSON.stringify({
    acceptedVia: context.acceptedVia,
    actorKey: context.actorKey || null,
    actorUserId: context.actorUserId || null,
    companyId: context.companyId,
    customerProfile: input.customerProfile || {},
    documentId: context.documentId,
    documentVersionId: context.documentVersionId,
    leadId: context.leadId,
    sendId: context.sendId,
  })).digest("hex");
}

export function acceptSharedPricingDocument(
  repository: PricingAcceptanceRepository,
  context: VerifiedSharedPricingAcceptance,
  input: SharedPricingAcceptanceInput,
): Promise<PricingAcceptanceResult> {
  return acceptPricingDocument(repository, {
    ...context,
    customerProfile: context.customerProfile || input.customerProfile || {},
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: fingerprint(context, input),
  });
}
