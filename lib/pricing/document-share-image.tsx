import { ImageResponse } from "next/og";
import { DOCUMENT_SHARE_BRAND, type DocumentShareImage } from "../../domains/pricing/document-share";

const label = (value: string, max: number) => Array.from(value.trim().replace(/\s+/g, " ")).slice(0, max).join("");

/** Only approved public metadata enters this renderer, never a document row or token. */
export function documentShareImage(data: DocumentShareImage) {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 56, background: "linear-gradient(135deg, #0f766e 0%, #134e4a 100%)", color: "white", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: 16, background: "rgba(255,255,255,0.16)", fontSize: 38, fontWeight: 800 }}>M</div>
        <div style={{ display: "flex", fontSize: 48, fontWeight: 800 }}>{DOCUMENT_SHARE_BRAND.name}</div>
      </div>
      <div style={{ display: "flex", fontSize: 48, fontWeight: 700, marginTop: 24 }}>{DOCUMENT_SHARE_BRAND.headline}</div>
      <div style={{ display: "flex", fontSize: 34, marginTop: 20, lineHeight: 1.2 }}>{label(data.companyName, 40) || "유통사"}</div>
      <div style={{ display: "flex", fontSize: 26, marginTop: 10, color: "rgba(255,255,255,0.84)", lineHeight: 1.2 }}>{label(data.title, 60) || "단가표"}</div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, marginTop: "auto", paddingTop: 24 }}>
        <div style={{ display: "flex" }}>발행 품목 {data.itemCount}개</div>
        <div style={{ display: "flex" }}>가격 유효기간 · {data.validUntil.replaceAll("-", ".")}</div>
      </div>
      <div style={{ display: "flex", fontSize: 18, marginTop: 16, color: "rgba(255,255,255,0.72)" }}>{DOCUMENT_SHARE_BRAND.operator}</div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } },
  );
}
