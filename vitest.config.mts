import { defineConfig } from "vitest/config";

export default defineConfig({
  // 컴포넌트 렌더 테스트용: tsconfig는 jsx=preserve(Next가 처리)라 vitest(Vite 8 oxc)에서 JSX를 직접 변환한다.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
