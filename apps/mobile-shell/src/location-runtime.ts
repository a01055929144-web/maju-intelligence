import { CapacitorHttp, registerPlugin } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import type { NativeLocationBridge, NativeLocationSample, StartWorkInput } from "./contracts";

type BackgroundLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  speed?: number;
  bearing?: number;
  time?: number;
};

type BackgroundLocationError = { code?: string; message?: string };
type BackgroundGeolocationPlugin = {
  addWatcher(
    options: Record<string, unknown>,
    callback: (location?: BackgroundLocation, error?: BackgroundLocationError) => void
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
};

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");
const SESSION_KEY = "maju-work-session-v1";
const MAX_SESSION_MS = 12 * 60 * 60 * 1000;

type StoredSession = Omit<StartWorkInput, "deviceToken"> & { watcherId: string };

function toSample(location: BackgroundLocation): NativeLocationSample {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyM: location.accuracy,
    recordedAt: new Date(location.time || Date.now()).toISOString(),
    altitudeM: location.altitude,
    speedMps: location.speed,
    headingDeg: location.bearing
  };
}

async function readSession(): Promise<StoredSession | null> {
  const stored = await Preferences.get({ key: SESSION_KEY });
  if (!stored.value) return null;
  try { return JSON.parse(stored.value) as StoredSession; } catch { return null; }
}

async function postBatch(token: string, samples: NativeLocationSample[]) {
  return CapacitorHttp.post({
    url: "https://maju-intelligence.vercel.app/api/staff/location/batch",
    headers: { Authorization: `Device ${token}`, "Content-Type": "application/json" },
    data: { samples }
  });
}

export function createNativeLocationBridge(): NativeLocationBridge {
  let stopTimer: ReturnType<typeof setTimeout> | null = null;
  let activeDeviceToken: string | null = null;
  let queuedSamples: NativeLocationSample[] = [];

  const bridge: NativeLocationBridge = {
    async startWork(input) {
      const previous = await readSession();
      if (previous) await bridge.stopWork("manual");
      activeDeviceToken = input.deviceToken;
      const watcherId = await BackgroundGeolocation.addWatcher({
        backgroundTitle: "MAJU 근무 중",
        backgroundMessage: "위치 공유가 켜져 있습니다.",
        requestPermissions: true,
        stale: false,
        distanceFilter: 15
      }, async (location, error) => {
        if (error || !location) return;
        queuedSamples = [...queuedSamples, toSample(location)].slice(-1000);
        await bridge.flush().catch(() => ({ sent: 0, remaining: queuedSamples.length }));
      });
      const { deviceToken: _deviceToken, ...sessionInput } = input;
      const session = { ...sessionInput, watcherId };
      await Preferences.set({ key: SESSION_KEY, value: JSON.stringify(session) });
      stopTimer = setTimeout(() => void bridge.stopWork("auto_12h"), MAX_SESSION_MS);
      return { started: true };
    },
    async stopWork() {
      const session = await readSession();
      if (session) await BackgroundGeolocation.removeWatcher({ id: session.watcherId }).catch(() => undefined);
      if (stopTimer) clearTimeout(stopTimer);
      stopTimer = null;
      await bridge.flush().catch(() => ({ sent: 0, remaining: 0 }));
      activeDeviceToken = null;
      queuedSamples = [];
      await Preferences.remove({ key: SESSION_KEY });
      return { stopped: true };
    },
    async getStatus() {
      const session = await readSession();
      return { active: Boolean(session), startedAt: session?.startedAt, queued: queuedSamples.length };
    },
    async flush() {
      if (!activeDeviceToken || !queuedSamples.length) {
        return { sent: 0, remaining: queuedSamples.length };
      }
      const batch = queuedSamples.slice(0, 100);
      const response = await postBatch(activeDeviceToken, batch);
      if (response.status < 200 || response.status >= 300) throw new Error(`location batch failed: ${response.status}`);
      queuedSamples = queuedSamples.slice(batch.length);
      return { sent: batch.length, remaining: queuedSamples.length };
    }
  };
  return bridge;
}

export function installNativeLocationBridge() {
  window.MAJUNativeLocation = createNativeLocationBridge();
}
