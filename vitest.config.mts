import { defineConfig } from "vitest/config";

export default defineConfig({
  // 컴포넌트 렌더 테스트용: tsconfig는 jsx=preserve(Next가 처리)라 vitest에서는 esbuild가 JSX를 직접 변환한다.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
