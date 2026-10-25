export type NativeLocationSample = {
  latitude: number;
  longitude: number;
  accuracyM: number;
  recordedAt: string;
  altitudeM?: number;
  speedMps?: number;
  headingDeg?: number;
};

export type StartWorkInput = {
  deviceToken: string;
  consentVersion: string;
  startedAt: string;
};

export type NativeLocationBridge = {
  startWork(input: StartWorkInput): Promise<{ started: true }>;
  stopWork(reason: "manual" | "logout" | "auto_12h"): Promise<{ stopped: true }>;
  getStatus(): Promise<{ active: boolean; startedAt?: string; queued: number }>;
  flush(): Promise<{ sent: number; remaining: number }>;
};

declare global {
  interface Window {
    MAJUNativeLocation?: NativeLocationBridge;
  }
}
