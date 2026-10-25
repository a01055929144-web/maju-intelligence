import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

const EXTERNAL_SCHEMES = /^(tel:|sms:|mailto:|kakaomap:|tmap:|nmap:)/i;

export function installNavigationBridge() {
  document.addEventListener("click", (event) => {
    const anchor = (event.target as Element | null)?.closest("a");
    if (!anchor) return;
    const href = anchor.href;
    if (!href || href.startsWith("https://maju-intelligence.vercel.app")) return;
    event.preventDefault();
    if (EXTERNAL_SCHEMES.test(href)) window.location.href = href;
    else void Browser.open({ url: href });
  });
  void App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.exitApp();
  });
}
