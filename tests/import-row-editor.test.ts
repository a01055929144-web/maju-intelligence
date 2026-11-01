import { describe, expect, it } from "vitest";
import {
  getImportRowChanges,
  restoreAllImportPreviewRows,
  restoreImportPreviewRow,
  updateImportPreviewCell,
  type ImportPreviewRow,
} from "../domains/product/import-row-editor";

const row: ImportPreviewRow = {
  id: "row-1",
  sourceRowNumber: 2,
  originalValues: { name: "깐양파", price: "18000" },
  values: { name: "깐양파", price: "18000" },
};
const fields = [{ key: "name", label: "상품명" }, { key: "price", label: "원가" }];

describe("import row editor", () => {
  it("keeps original values while updating the editable copy", () => {
    const updated = updateImportPreviewCell([row], row.id, "price", "18500");
    expect(updated[0].originalValues.price).toBe("18000");
    expect(updated[0].values.price).toBe("18500");
    expect(row.values.price).toBe("18000");
  });

  it("reports only fields that differ from the original", () => {
    const [updated] = updateImportPreviewCell([row], row.id, "price", "18500");
    expect(getImportRowChanges(updated, fields)).toEqual([
      { fieldKey: "price", originalValue: "18000", value: "18500" },
    ]);
  });

  it("restores one row or all rows without mutating the originals", () => {
    const rows = [
      updateImportPreviewCell([row], row.id, "price", "18500")[0],
      { ...row, id: "row-2", values: { ...row.values, name: "양파" } },
    ];
    expect(restoreImportPreviewRow(rows, "row-1")[0].values.price).toBe("18000");
    expect(restoreAllImportPreviewRows(rows).map((item) => item.values)).toEqual([
      row.originalValues,
      row.originalValues,
    ]);
  });
});
