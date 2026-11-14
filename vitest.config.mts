import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // 컴포넌트 렌더 테스트용: tsconfig는 jsx=preserve(Next가 처리)라 vitest(Vite 8 oxc)에서 JSX를 직접 변환한다.
  oxc: { jsx: { runtime: "automatic" } },
  // 앱 코드의 `@/` 경로(tsconfig paths)를 테스트에서도 그대로 푼다. 이게 없어서 `.test.tsx` 페이지 테스트가 실행되지 못했다.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]
  }
});
