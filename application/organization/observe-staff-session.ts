import { buildStaffSessionObservation, type StaffSessionObservation } from "../../domains/organization/session-observation";

export type StaffSessionObservationRepository = {
  upsert(observation: StaffSessionObservation): Promise<void>;
};

export async function observeStaffSession(
  input: {
    companyId?: string;
    deviceHash?: string;
    enabled: boolean;
    observedAt: Date;
    userId?: string;
  },
  repository: StaffSessionObservationRepository
): Promise<"recorded" | "skipped"> {
  const observation = buildStaffSessionObservation(input);
  if (!observation) return "skipped";
  await repository.upsert(observation);
  return "recorded";
}

