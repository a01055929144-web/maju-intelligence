export type ImportPreviewField = {
  key: string;
  label: string;
};

export type ImportPreviewRow = {
  id: string;
  sourceRowNumber: number;
  originalValues: Record<string, string>;
  values: Record<string, string>;
};

export type ImportCellChange = {
  fieldKey: string;
  originalValue: string;
  value: string;
};

export function updateImportPreviewCell(
  rows: ImportPreviewRow[],
  rowId: string,
  fieldKey: string,
  value: string,
) {
  return rows.map((row) =>
    row.id === rowId
      ? { ...row, values: { ...row.values, [fieldKey]: value } }
      : row,
  );
}

export function getImportRowChanges(row: ImportPreviewRow, fields: ImportPreviewField[]) {
  return fields.flatMap<ImportCellChange>((field) => {
    const originalValue = row.originalValues[field.key] ?? "";
    const value = row.values[field.key] ?? "";
    return originalValue === value ? [] : [{ fieldKey: field.key, originalValue, value }];
  });
}

export function restoreImportPreviewRow(rows: ImportPreviewRow[], rowId: string) {
  return rows.map((row) =>
    row.id === rowId ? { ...row, values: { ...row.originalValues } } : row,
  );
}

export function restoreAllImportPreviewRows(rows: ImportPreviewRow[]) {
  return rows.map((row) => ({ ...row, values: { ...row.originalValues } }));
}
