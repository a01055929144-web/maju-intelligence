import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "MAJU 직원 초대";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** 11/4: 카카오톡으로 보내는 직원 초대 카드 이미지(회사명은 카드 제목에 들어갑니다). */
export default function InviteOpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0b1220", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", padding: "72px", background: "linear-gradient(135deg, #0f766e 0%, #0b1220 75%)" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 88, height: 88, borderRadius: 22, background: "#14b8a6", color: "#ffffff", fontSize: 46, fontWeight: 900 }}>M</div>
            <div style={{ display: "flex", marginLeft: 24, color: "#ffffff", fontSize: 44, fontWeight: 900 }}>MAJU</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", color: "#5eead4", fontSize: 34, fontWeight: 700 }}>직원 초대</div>
            <div style={{ display: "flex", marginTop: 14, color: "#ffffff", fontSize: 64, fontWeight: 900, letterSpacing: -1 }}>카카오로 가입하고 바로 시작하세요</div>
            <div style={{ display: "flex", marginTop: 18, color: "rgba(255,255,255,0.78)", fontSize: 30, fontWeight: 600 }}>휴대폰 뒷자리 4자리 확인 → 카카오 인증 → 오늘 업무</div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
