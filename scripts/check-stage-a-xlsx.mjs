import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import * as XLSX from 'xlsx';
import { buildPurchaseSheet, suggestPurchaseMapping, parsePurchaseLines, mergeDuplicateLines } from '../domains/pricing/purchase-import.ts';
import { buildPurchaseDateRows } from '../domains/pricing/purchase-cost-date.ts';
const input = process.argv[2];
assert(input && isAbsolute(input), 'Provide the approved local XLSX path; this script never uploads it');
const workbook = XLSX.read(readFileSync(input), { type: 'buffer', cellDates: true, dateNF: 'yyyy-mm-dd' });
const sheet = buildPurchaseSheet(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd' }));
const mapping = suggestPurchaseMapping(sheet);
const parsed = parsePurchaseLines(sheet, mapping, 'auto');
const identities = new Map(), choices = new Map();
const id = n => `20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const lines = parsed.lines.map(line => {
  const key = JSON.stringify([line.code || line.lineKey, line.supplier]);
  if (!identities.has(key)) identities.set(key, identities.size + 1);
  const productId = id(identities.get(key));
  const purchaseDate = line.purchaseDate || '2026-11-07';
  choices.set(`${productId}|${purchaseDate}`, line.rowNumber);
  return { ...line, productId, supplierProductId: productId, purchaseDate };
});
const rows = buildPurchaseDateRows(lines, Array.from(choices.values()), []);
const bytes = Buffer.byteLength(JSON.stringify({ action: 'save', companyId: id(1), batchId: id(2), receiptDate: '2026-11-07', fileName: 'local-read-check.xlsx', rows }));
const result = { validRows: lines.length, skippedRows: parsed.skipped.length, invalidDates: parsed.dateIssues.length,
  products: identities.size, priceGroups: choices.size, conflictGroups: mergeDuplicateLines(lines).conflicts.length,
  emptyUnitRows: lines.filter(line => !line.unit.trim()).length, estimatedJsonBytes: bytes, belowFourMillionBytes: bytes <= 4000000,
  readOnly: true, uploaded: false };
assert.equal(result.validRows, 3417); assert.equal(result.products, 745); assert.equal(result.conflictGroups, 188);
assert.equal(result.emptyUnitRows, 1552); assert.equal(result.skippedRows, 0); assert.equal(result.invalidDates, 0);
assert(result.belowFourMillionBytes);
console.log(JSON.stringify(result));
