import type { StaffSessionObservationRepository } from "../../application/organization/observe-staff-session";
import { supabaseRequest } from "../store";

export const staffSessionObservationRepository: StaffSessionObservationRepository = {
  async upsert(observation) {
    await supabaseRequest<void>("staff_account_sessions?on_conflict=company_id,user_id,device_hash", {
      body: JSON.stringify({
        company_id: observation.companyId,
        device_hash: observation.deviceHash,
        last_seen_at: observation.observedAt,
        user_id: observation.userId
      }),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      method: "POST"
    });
  }
};

