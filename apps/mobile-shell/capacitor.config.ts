import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "kr.co.biv.maju",
  appName: "MAJU",
  webDir: "www",
  server: {
    url: "https://maju-intelligence.vercel.app/mobile",
    cleartext: false,
    allowNavigation: ["maju-intelligence.vercel.app"]
  },
  android: {
    // community background-geolocation 권장 설정. 백그라운드 5분 이후 중단을 방지한다.
    useLegacyBridge: true
  }
};

export default config;
