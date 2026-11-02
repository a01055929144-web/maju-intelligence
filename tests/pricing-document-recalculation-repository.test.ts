import {beforeEach,describe,expect,it,vi} from "vitest";
const {db}=vi.hoisted(()=>({db:vi.fn()}));
vi.mock("../lib/store",()=>({supabaseRequest:db}));
import {pricingDocumentsRepository} from "../lib/pricing/documents-repository";
const company="00000000-0000-4000-8000-000000000001",doc="10000000-0000-4000-8000-000000000001",product="20000000-0000-4000-8000-000000000001",supplier="30000000-0000-4000-8000-000000000001";
const scope={companyId:company,actor:"opaque-author",manager:false};
type List={items:{id:string;content:{lines:{productId:string}[]};recalculation:{publishedAt:string;needsRecalculation:boolean;changedProductCount:number}}[];total:number};
let publishedAt:string,recalculated:boolean,changed:boolean;
function fixture(path:string){
 if(path==="rpc/pricing_p1")return {items:[{id:doc,revision:1,content:{lines:[{productId:product},{productId:product}]}}],total:1};
 if(path.startsWith("pricing_documents?"))return [{id:doc,versions:[{published_at:publishedAt,content:{lines:[{productId:product},{productId:product}]}}]}];
 if(path.startsWith("price_recalc_changes?"))return recalculated?[{product_id:product,before_value:{price:100,applied_cost:67891},after_value:{price:200,applied_cost:78912},run:{created_at:"2026-11-02T03:00:00Z"}}]:[];
 if(path.startsWith("supplier_product_matches?"))return [{product_catalog_id:product,supplier_product_id:supplier}];
 if(path.startsWith("supplier_product_cost_history?"))return changed?[{id:"h",supplier_product_id:supplier,purchase_price:78912,created_at:"2026-11-02T02:00:00Z"}]:[];
 if(path.startsWith("supplier_products?"))return [{id:supplier,baseline:[{purchase_price:67891,created_at:"2026-11-01T00:00:00Z"}]}];
 throw Error("Unexpected fixture request");
}
beforeEach(()=>{db.mockReset().mockImplementation(async(path:string)=>fixture(path));publishedAt="2026-11-02T01:00:00Z";changed=false;recalculated=false});
const list=()=>pricingDocumentsRepository.request<List>(scope,"list",{page:1});
describe("server document status read model",()=>{
 it("persists status across independent reads and only clears after republishing",async()=>{
  expect((await list()).items[0].recalculation.needsRecalculation).toBe(false);changed=true;
  expect((await list()).items[0].recalculation.changedProductCount).toBe(1);recalculated=true;
  expect((await list()).items[0].recalculation.needsRecalculation).toBe(true);publishedAt="2026-11-02T04:00:00Z";
  expect((await list()).items[0].recalculation.needsRecalculation).toBe(false);
 });
 it("scopes every query to authenticated company and RPC-authorized documents without leaking costs",async()=>{
  changed=true;recalculated=true;const result=await list();
  for(const [path,options] of db.mock.calls){if(path==="rpc/pricing_p1")expect(JSON.parse(options.body)).toMatchObject({p_company:company,p_actor:scope.actor,p_manager:false});else expect(path).toContain(`company_id=eq.${company}`)}
  const versionPath=db.mock.calls.find(c=>c[0].startsWith("pricing_documents?"))![0];expect(versionPath).toContain(`id=in.(${doc})`);expect(versionPath).toContain("versions.limit=1");expect(versionPath).toContain("versions.order=version.desc");
  expect(JSON.stringify(result)).not.toContain("67891");expect(JSON.stringify(result)).not.toContain("78912");
 });
 it("uses latest published membership instead of unsaved draft membership",async()=>{
  changed=true;db.mockImplementation(async(path:string)=>path.startsWith("pricing_documents?")?[{id:doc,versions:[{published_at:publishedAt,content:{lines:[{productId:"old-product"}]}}]}]:fixture(path));
  expect((await list()).items[0].recalculation.changedProductCount).toBe(0);
 });
 it("does not read history for an unpublished or empty list",async()=>{
  db.mockImplementation(async(path:string)=>path.startsWith("pricing_documents?")?[{id:doc,versions:[]}]:fixture(path));expect((await list()).items[0].recalculation).toMatchObject({publishedAt:null,needsRecalculation:false});expect(db).toHaveBeenCalledTimes(2);
  db.mockReset().mockResolvedValue({items:[],total:0});expect(await list()).toEqual({items:[],total:0});expect(db).toHaveBeenCalledTimes(1);
 });
 it("fails visibly when publication/history is unavailable",async()=>{
  db.mockImplementation(async(path:string)=>{if(path.startsWith("pricing_documents?"))return [];return fixture(path)});await expect(list()).rejects.toThrow("문서가 변경");
  db.mockImplementation(async(path:string)=>{if(path.startsWith("supplier_product_cost_history?"))throw Error("history unavailable");return fixture(path)});await expect(list()).rejects.toThrow("history unavailable");
 });
 it("passes other actions through without status reads",async()=>{db.mockResolvedValue({saved:true});expect(await pricingDocumentsRepository.request(scope,"save",{})).toEqual({saved:true});expect(db).toHaveBeenCalledTimes(1)});
 it("refuses truncated history rather than returning clean status",async()=>{
  const page=Array.from({length:500},()=>({product_id:product,before_value:{price:1,applied_cost:1},after_value:{price:2,applied_cost:2},run:{created_at:"2026-11-02T03:00:00Z"}}));
  db.mockImplementation(async(path:string)=>path.startsWith("price_recalc_changes?")?page:fixture(path));await expect(list()).rejects.toThrow("이력이 많아");
 });
});
