import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

const script = path.join(process.cwd(), "scripts", "check-max-duration.mjs");
const temporaryDirectories: string[] = [];

afterEach(() => temporaryDirectories.splice(0).forEach((directory) => fs.rmSync(directory, { force: true, recursive: true })));

function runWith(value: number) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "max-duration-"));
  temporaryDirectories.push(directory);
  const route = path.join(directory, "app", "api", "sample", "route.ts");
  fs.mkdirSync(path.dirname(route), { recursive: true });
  fs.writeFileSync(route, `export const maxDuration = ${value};\n`);
  return spawnSync(process.execPath, [script], { cwd: directory, encoding: "utf8" });
}

describe("check-max-duration", () => {
  test("current routes stay within the Hobby limit", () => {
    expect(spawnSync(process.execPath, [script], { encoding: "utf8" }).status).toBe(0);
  });

  test("accepts the 60 second boundary", () => {
    expect(runWith(60).status).toBe(0);
  });

  test("rejects values above 60 seconds", () => {
    const result = runWith(61);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${path.join("app", "api", "sample", "route.ts")}: 61`);
  });
});
