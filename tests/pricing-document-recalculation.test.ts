import {describe,expect,it} from "vitest";
import {changedCostEvents,documentRecalculation} from "../domains/pricing/document-recalculation";
const publication={publishedAt:"2026-11-02T01:00:00Z",productIds:["a","a","b"]};
describe("published document recalculation",()=>{
 it("publication -> cost change -> needed -> recalculate draft -> republish -> clear",()=>{
  expect(documentRecalculation(publication,[]).needsRecalculation).toBe(false);
  const changes=[{productId:"a",changedAt:"2026-11-02T02:00:00Z"}];
  expect(documentRecalculation(publication,changes)).toMatchObject({needsRecalculation:true,changedProductCount:1});
  changes.push({productId:"a",changedAt:"2026-11-02T03:00:00Z"});
  expect(documentRecalculation(publication,changes).changedProductCount).toBe(1);
  expect(documentRecalculation({...publication,publishedAt:"2026-11-02T04:00:00Z"},changes)).toMatchObject({needsRecalculation:false,changedProductCount:0});
 });
 it("uses strictly later times and counts unique products in the published version",()=>{
  expect(documentRecalculation(publication,[{productId:"a",changedAt:"2026-11-02T10:00:00+09:00"},{productId:"b",changedAt:"2026-11-01T23:00:00Z"},{productId:"other",changedAt:"2026-11-02T04:00:00Z"}]).changedProductCount).toBe(0);
  expect(documentRecalculation(publication,[{productId:"a",changedAt:"2026-11-02T02:00:00Z"},{productId:"b",changedAt:"2026-11-02T02:00:00Z"}]).changedProductCount).toBe(2);
  expect(documentRecalculation(undefined,[{productId:"a",changedAt:"2026-11-02T02:00:00Z"}])).toEqual({publishedAt:null,needsRecalculation:false,changedProductCount:0});
 });
 it("preserves PostgreSQL microsecond ordering within a millisecond",()=>{
  expect(documentRecalculation({...publication,publishedAt:"2026-11-02T01:00:00.123456Z"},[{productId:"a",changedAt:"2026-11-02T10:00:00.123457+09:00"}]).changedProductCount).toBe(1);
  expect(documentRecalculation({...publication,publishedAt:"2026-11-02T01:00:00.123456Z"},[{productId:"a",changedAt:"2026-11-02T01:00:00.123455Z"}]).changedProductCount).toBe(0);
 });
 it("does not acknowledge invalid history times",()=>{expect(()=>documentRecalculation({...publication,publishedAt:"invalid"},[])).toThrow();expect(()=>documentRecalculation(publication,[{productId:"a",changedAt:"invalid"}])).toThrow()});
 it("ignores repeated equal costs, preserves zero, and orders recorded changes",()=>{
  const rows=[{id:"3",purchase_price:200,created_at:"2026-11-02T04:00:00Z"},{id:"1",purchase_price:100,created_at:"2026-11-02T02:00:00Z"},{id:"2",purchase_price:200,created_at:"2026-11-02T03:00:00Z"}];
  expect(changedCostEvents(rows,100).map(r=>r.id)).toEqual(["2"]);
  expect(changedCostEvents([{id:"0",purchase_price:0,created_at:"2026-11-02T02:00:00Z"}],0)).toHaveLength(0);
 });
});
