import { randomBytes } from "crypto";

import type { CustomerSession } from "@/lib/auth";
import { prepareStoreOwnerActivation } from "@/lib/store/07-store-owner-provisioning";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function prepareStoreOwnerActivationForCustomer(session: CustomerSession, customerId: string) {
  if (!session.companyMemberId || !["owner", "manager"].includes(session.workspaceRole) || !UUID.test(customerId)) return null;
  const token = randomBytes(32).toString("base64url");
  const prepared = await prepareStoreOwnerActivation({ actorCompanyMemberId: session.companyMemberId,
    companyId: session.companyId, customerId, token });
  return { ...prepared, token };
}
