import { expect, test } from "@playwright/test";
import * as XLSX from "xlsx";
import type { StoreCostInput } from "../../domains/store-cost/store-cost";
type ImportRequest = { companyId: string; storeAccountId: string; importId: string; fileName: string; mode: "preview" | "apply"; confirmationHash?: string; rows: StoreCostInput[] };

test.use({ timezoneId: "Asia/Seoul" });

const companyId = "00000000-0000-4000-8000-000000000001";
const storeAccountId = "20000000-0000-4000-8000-000000000001";
const csv = (text: string, name = "합성-원가.csv") => ({ name, mimeType: "text/csv", buffer: Buffer.from(text, "utf8") });
const valid = "적용일,품목명,규격,단위,단가\n2026-11-07,합성 채소,1kg,봉,3500\n";

test("PC maps columns, previews duplicates, requires confirmation and retries the same import after response loss", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  let saved = false;
  const requests: ImportRequest[] = [];
  await page.route("**/api/store/costs?**", route => route.fulfill({ json: { rows: saved ? [{ id: "cost-1", revision: 1, effectiveOn: "2026-11-07", productName: "합성 채소", specification: "1kg", unit: "봉", costKrw: 3900 }] : [], hasMore: false, nextOffset: null } }));
  await page.route("**/api/store/costs/import", async route => {
    expect(route.request().method()).toBe("POST");
    const body = route.request().postDataJSON(); requests.push(body);
    expect(body).toMatchObject({ companyId, storeAccountId });
    expect(body.importId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).not.toHaveProperty("token"); expect(body).not.toHaveProperty("fileBytesBase64");
    expect(JSON.stringify(body)).not.toContain("原文_ONLY");
    expect(body.rows).toEqual([{ effectiveOn: "2026-11-07", productName: "합성 채소", specification: "1kg", unit: "봉", costKrw: 3900, sourceRowNumber: 3 }]);
    if (body.mode === "preview") return route.fulfill({ json: { fileName: body.fileName, importId: body.importId, rows: body.rows, confirmationHash: "a".repeat(64) } });
    expect(body.mode).toBe("apply"); expect(body.confirmationHash).toBe("a".repeat(64));
    if (!saved) { saved = true; return route.abort("failed"); }
    return route.fulfill({ json: { imported: 0, replayed: 1, total: 1 } });
  });
  await page.goto("/store?fixture=store-cost-owner");
  await page.getByRole("button", { name: "엑셀 원가 업로드", exact: true }).click();
  const upload = page.getByRole("region", { name: "엑셀 원가 업로드", exact: true });
  await expect(upload.getByText("선택한 파일이 없습니다.", { exact: false })).toBeVisible();
  await upload.getByLabel("원가 파일 선택").setInputFiles(csv("적용일,품목명,규격,단위,매장매입금액,메모\n2026.11.07,합성 채소,1kg,봉,3500,原文_ONLY\n2026-11-07,합성 채소,1kg,봉,3900,原文_ONLY\n"));
  await expect(upload.getByRole("alert")).toContainText("필수 열");
  const costMapping = upload.getByTitle("E · 매장매입금액", { exact: true }).locator("xpath=../../..").getByRole("combobox");
  await costMapping.selectOption("costKrw");
  await expect(upload.getByText("반영 후보 1행 · 오류 0행 · 중복 1행", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
  await upload.getByRole("button", { name: "반영 전 최종 확인", exact: true }).click();
  await expect(upload.getByRole("button", { name: "확인 후 반영", exact: true })).toBeDisabled();
  const firstImportId = requests[0].importId;
  await upload.getByRole("checkbox", { name: "미리보기 원가와 중복 처리 내용을 확인했습니다." }).check();
  // Changing even a single mapping invalidates the server confirmation and operation ID.
  await costMapping.selectOption("");
  await expect(upload.getByRole("button", { name: "확인 후 반영", exact: true })).toHaveCount(0);
  await costMapping.selectOption("costKrw");
  await upload.getByRole("button", { name: "반영 전 최종 확인", exact: true }).click();
  await expect(upload.getByRole("button", { name: "확인 후 반영", exact: true })).toBeDisabled();
  expect(requests[1].importId).not.toBe(firstImportId);
  await upload.getByRole("checkbox", { name: "미리보기 원가와 중복 처리 내용을 확인했습니다." }).check();
  await page.screenshot({ path: info.outputPath("store-cost-upload-pc.png"), fullPage: true });
  await upload.getByRole("button", { name: "확인 후 반영", exact: true }).click();
  await expect(upload.getByRole("alert")).toContainText("다시 시도");
  await upload.getByRole("button", { name: "확인 후 반영", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "중복 저장하지 않았습니다" })).toBeVisible();
  expect(requests[2]).toEqual(requests[3]);
  expect(requests[2].importId).toBe(requests[1].importId);
  expect(requests[2].rows).toEqual(requests[1].rows);
  await expect(upload).toHaveCount(0);
  const storage = await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)].join("\n"));
  expect(storage).not.toContain("原文_ONLY"); expect(storage).not.toContain("합성 채소");
});

test("empty and invalid files, row errors and server permission errors never apply rows", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  let status = 401, posts = 0;
  await page.route("**/api/store/costs?**", route => route.fulfill({ json: { rows: [], hasMore: false, nextOffset: null } }));
  await page.route("**/api/store/costs/import", route => {
    posts++; expect(route.request().postDataJSON().mode).toBe("preview");
    return route.fulfill({ status, json: { message: "Synthetic error" } });
  });
  await page.goto("/store?fixture=store-cost-manager");
  await page.getByRole("button", { name: "엑셀 원가 업로드", exact: true }).click();
  const upload = page.getByRole("region", { name: "엑셀 원가 업로드", exact: true });
  const file = upload.getByLabel("원가 파일 선택");
  await file.setInputFiles(csv("bad", "잘못된파일.txt"));
  await expect(upload.getByRole("alert")).toContainText("xlsx·xls·csv");
  await file.setInputFiles(csv("적용일,품목명,규격,단위,단가\n"));
  await expect(upload.getByRole("alert")).toContainText("원가 행이 없습니다");
  await file.setInputFiles(csv(valid.replace("3500", "-1")));
  await expect(upload.getByText("반영 후보 0행 · 오류 1행 · 중복 0행", { exact: true })).toBeVisible();
  await expect(upload.getByRole("button", { name: "반영 전 최종 확인", exact: true })).toBeDisabled();
  expect(posts).toBe(0);
  await file.setInputFiles(csv(valid));
  for (const [code, message] of [[401, "로그인"], [403, "점주·관리자"], [404, "아직 사용할 수 없습니다"], [400, "열 연결"], [503, "다시 시도"]] as const) {
    status = code;
    await upload.getByRole("button", { name: "반영 전 최종 확인", exact: true }).click();
    await expect(upload.getByRole("alert")).toContainText(message);
    await expect(upload.getByRole("button", { name: "확인 후 반영", exact: true })).toHaveCount(0);
  }
  await page.screenshot({ path: info.outputPath("store-cost-upload-error.png"), fullPage: true });
  await file.setInputFiles(csv(valid.replace("3500", "")));
  await expect(upload.getByText("반영 후보 0행 · 오류 1행 · 중복 0행", { exact: true })).toBeVisible();
  await expect(upload.getByRole("button", { name: "반영 전 최종 확인", exact: true })).toBeDisabled();
});

test("xlsx date cells normalize through the 04 parser; a new file resets confirmation and import ID", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const previews: ImportRequest[] = [];
  await page.route("**/api/store/costs?**", route => route.fulfill({ json: { rows: [], hasMore: false, nextOffset: null } }));
  await page.route("**/api/store/costs/import", route => {
    const body = route.request().postDataJSON(); previews.push(body);
    expect(body.mode).toBe("preview");
    expect(body.rows[0]).toMatchObject({ effectiveOn: "2026-11-07", costKrw: 3500 });
    return route.fulfill({ json: { fileName: body.fileName, importId: body.importId, rows: body.rows, confirmationHash: "b".repeat(64) } });
  });
  await page.goto("/store?fixture=store-cost-owner");
  await page.getByRole("button", { name: "엑셀 원가 업로드", exact: true }).click();
  const upload = page.getByRole("region", { name: "엑셀 원가 업로드", exact: true });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["적용일", "품목명", "규격", "단위", "단가"], [new Date("2026-11-07T00:00:00Z"), "합성 채소", "1kg", "봉", 3500]]), "합성");
  await upload.getByLabel("원가 파일 선택").setInputFiles({ name: "합성.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) });
  await expect(upload.getByText("반영 후보 1행 · 오류 0행 · 중복 0행", { exact: true })).toBeVisible();
  await upload.getByRole("button", { name: "반영 전 최종 확인", exact: true }).click();
  await expect(upload.getByRole("button", { name: "확인 후 반영", exact: true })).toBeDisabled();
  await upload.getByLabel("원가 파일 선택").setInputFiles(csv(valid));
  await expect(upload.getByRole("button", { name: "확인 후 반영", exact: true })).toHaveCount(0);
  await upload.getByRole("button", { name: "반영 전 최종 확인", exact: true }).click();
  await expect(upload.getByRole("button", { name: "확인 후 반영", exact: true })).toBeDisabled();
  expect(previews[0].importId).not.toBe(previews[1].importId);
});

test("staff and 390px keep the upload controls hidden", async ({ page }, info) => {
  await page.route("**/api/store/costs?**", route => route.fulfill({ json: { rows: [], hasMore: false, nextOffset: null } }));
  await page.route("**/api/store/costs/import", () => { throw new Error("Upload must not be requested"); });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/store?fixture=store-cost-staff");
  await expect(page.getByText("직원은 원가를 조회할 수 있습니다.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "엑셀 원가 업로드", exact: true })).toHaveCount(0);
  await page.goto("/store?fixture=store-cost-owner");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "엑셀 원가 업로드", exact: true })).toBeHidden();
  await expect(page.getByText("PC에서 같은 매장 주소를 열어 주세요.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("store-cost-upload-390.png"), fullPage: true });
});
