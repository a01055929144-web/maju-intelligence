export type PricingAcceptanceVia = "store" | "staff" | "kakao_start" | "kakao_login";

export type PricingAcceptanceCommand = {
  acceptedVia: PricingAcceptanceVia;
  actorKey?: string;
  actorUserId?: string;
  companyId: string;
  customerId?: string;
  customerProfile?: Record<string, unknown>;
  documentId: string;
  documentVersionId: string;
  idempotencyKey: string;
  leadId?: string;
  needsReview?: boolean;
  requestFingerprint: string;
  reviewReason?: string;
  sendId?: string;
};

export type PricingAcceptanceResult = {
  customerId?: string;
  documentVersionId: string;
  kind: "sheet" | "quote";
  leadId?: string;
  needsReview: boolean;
  orderEnabled: boolean;
  orderSetupRequired?: boolean;
  storefrontLinkId?: string;
  storefrontToken?: string;
};

export type PricingAcceptanceRepository = {
  accept(command: PricingAcceptanceCommand): Promise<PricingAcceptanceResult>;
};
