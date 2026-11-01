import type {
  AuditedRecord,
  VerifiedStaff,
} from "../../application/order/authorized-vault";
import { supabaseRequest } from "../store";
/** No exported singleton or HTTP route: caller must wire verified auth and approved private resources. */
export function onboardingAuthorizationRepository(request = supabaseRequest) {
  return {
    authorize(staff: VerifiedStaff, recordId: string, purpose: string) {
      return request<AuditedRecord>("rpc/authorize_store_onboarding_read", {
        method: "POST",
        body: JSON.stringify({
          p_company: staff.companyId,
          p_user: staff.userId,
          p_record: recordId,
          p_purpose: purpose,
        }),
      });
    },
  };
}
