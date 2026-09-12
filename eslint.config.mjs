import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({
  baseDirectory: configDirectory,
  recommendedConfig: js.configs.recommended
});

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "coverage/**", "outputs/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["components/kakao-address-map.tsx"],
    rules: { "@typescript-eslint/no-explicit-any": "off" }
  },
  {
    files: ["next-env.d.ts"],
    rules: { "@typescript-eslint/triple-slash-reference": "off" }
  }
];

export default eslintConfig;
