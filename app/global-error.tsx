"use client";

import { useEffect } from "react";

/**
 * app/error.tsx는 layout.tsx 아래의 렌더링 에러만 잡습니다. 루트 레이아웃 자체가 깨지는
 * (아주 드문) 경우까지 대비하려면 global-error.tsx가 따로 필요합니다 — 이땐 layout.tsx가
 * 대체되므로 <html>/<body>를 직접 포함해야 합니다(Next.js 규칙).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Unhandled root error:", error);
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <main style={{ display: "grid", minHeight: "100vh", placeItems: "center", padding: "2.5rem 1rem", fontFamily: "sans-serif" }}>
          <div style={{ maxWidth: "24rem", textAlign: "center" }}>
            <h1 style={{ fontSize: "1.125rem", fontWeight: 900 }}>서비스를 불러오지 못했습니다</h1>
            <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#64748b" }}>
              잠시 후 다시 접속해주세요. 문제가 계속되면 관리자에게 문의해주세요.
            </p>
            <button
              onClick={reset}
              style={{
                marginTop: "1.25rem",
                height: "2.75rem",
                width: "100%",
                borderRadius: "0.375rem",
                backgroundColor: "#0f766e",
                color: "#fff",
                fontWeight: 900,
                fontSize: "0.875rem"
              }}
              type="button"
            >
              다시 시도
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
