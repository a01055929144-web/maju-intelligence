export const SESSION_OBSERVATION_HEARTBEAT_MS = 5 * 60 * 1000;

export type StaffSessionObservation = {
  companyId: string;
  deviceHash: string;
  observedAt: string;
  userId: string;
};

export function buildStaffSessionObservation(input: {
  companyId?: string;
  deviceHash?: string;
  enabled: boolean;
  membershipValidated: boolean;
  observedAt: Date;
  userId?: string;
}): StaffSessionObservation | null {
  if (!input.enabled || !input.membershipValidated || !input.companyId || !input.userId || !/^[a-f0-9]{64}$/.test(input.deviceHash || "")) return null;
  return {
    companyId: input.companyId,
    deviceHash: input.deviceHash as string,
    observedAt: input.observedAt.toISOString(),
    userId: input.userId
  };
}

export function isValidObservationDeviceId(value?: string) {
  return Boolean(value && /^[a-f0-9]{64}$/.test(value));
}

export function shouldRefreshSessionObservation(input: { lastObservedAt?: number; now: number }) {
  return !input.lastObservedAt || input.now - input.lastObservedAt >= SESSION_OBSERVATION_HEARTBEAT_MS;
}

