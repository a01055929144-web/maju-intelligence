import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "MAJU Intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// 카카오톡 등으로 링크를 공유했을 때 뜨는 미리보기 카드 이미지입니다.
// public/에 업로드된 이미지 파일이 없어서, next/og로 요청 시점에 직접 그려 생성합니다.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "80px",
          background: "linear-gradient(135deg, #0f766e 0%, #134e4a 100%)",
          fontFamily: "sans-serif"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 96,
            height: 96,
            borderRadius: 24,
            background: "rgba(255,255,255,0.16)",
            color: "#ffffff",
            fontSize: 48,
            fontWeight: 900,
            marginBottom: 40
          }}
        >
          M
        </div>
        <div style={{ display: "flex", color: "#ffffff", fontSize: 68, fontWeight: 900, letterSpacing: -1 }}>
          MAJU Intelligence
        </div>
        <div style={{ display: "flex", marginTop: 20, color: "rgba(255,255,255,0.82)", fontSize: 32, fontWeight: 600 }}>
          거래처·배송 코스·매출을 한 화면에서 관리하는 영업 운영 플랫폼
        </div>
      </div>
    ),
    { ...size }
  );
}
