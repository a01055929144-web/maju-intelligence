import type { NextRequest } from "next/server";
import { getRequestAuthScope } from "../auth";
import { areHoldModulesEnabled } from "../feature-modules";
import { priceSheetsEnabled } from "./feature";
import { storeOrderingEnabled } from "./store-order-feature";
import {
  authorizedVault,
  type AuthorizedVaultPorts,
} from "../../application/order/authorized-vault";
import { onboardingAuthorizationRepository } from "./onboarding-repository";
type PrivateResources = Pick<
  AuthorizedVaultPorts,
  "ready" | "readPrivate" | "decrypt"
>;
/** Server adapter only. No route exports it; missing approved resource wiring stays closed. */
export function onboardingStaffReader(resources?: PrivateResources) {
  return {
    async read(request: NextRequest, recordId: string, purpose: string) {
      if (!resources?.ready || !priceSheetsEnabled() || !storeOrderingEnabled())
        throw new Error("자료 보호 연결이 준비되지 않았습니다.");
      const auth = await getRequestAuthScope(request);
      if (
        !auth.ok ||
        !auth.companyId ||
        !auth.customerSession?.userId ||
        !areHoldModulesEnabled(auth.companyId)
      )
        throw new Error("자료를 열람할 수 없습니다.");
      // No request JSON/company/role/assigned values are accepted by this adapter.
      const vault = authorizedVault({
        ...resources,
        authorize: onboardingAuthorizationRepository().authorize,
      });
      return vault.read(
        { companyId: auth.companyId, userId: auth.customerSession.userId },
        recordId,
        purpose,
      );
    },
  };
}
