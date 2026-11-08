import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const {db}=vi.hoisted(()=>({db:vi.fn()}));
vi.mock("../lib/store",()=>({
 getSupabaseConfig:()=>({url:process.env.SUPABASE_URL,serviceRoleKey:process.env.SUPABASE_SERVICE_ROLE_KEY}),
 supabaseRequest:db,
}));
import {pricingDocumentsRepository} from "../lib/pricing/documents-repository";
const company="00000000-0000-4000-8000-000000000001",doc="10000000-0000-4000-8000-000000000001",product="20000000-0000-4000-8000-000000000001",supplier="30000000-0000-4000-8000-000000000001";
const scope={companyId:company,actor:"opaque-author",manager:false};
type List={items:{id:string;content:{lines:{productId:string}[]};recalculation:{publishedAt:string;needsRecalculation:boolean;changedProductCount:number}}[];total:number};
let publishedAt:string,recalculated:boolean,changed:boolean;
function fixture(path:string){
 if(path.startsWith("pricing_documents?"))return [{id:doc,versions:[{published_at:publishedAt,content:{lines:[{productId:product},{productId:product}]}}]}];
 if(path.startsWith("price_recalc_changes?"))return recalculated?[{product_id:product,before_value:{price:100,applied_cost:67891},after_value:{price:200,applied_cost:78912},run:{created_at:"2026-11-02T03:00:00Z"}}]:[];
 if(path.startsWith("supplier_product_matches?"))return [{product_catalog_id:product,supplier_product_id:supplier}];
 if(path.startsWith("supplier_product_cost_history?"))return changed?[{id:"h",supplier_product_id:supplier,purchase_price:78912,created_at:"2026-11-02T02:00:00Z"}]:[];
 if(path.startsWith("supplier_products?"))return [{id:supplier,baseline:[{purchase_price:67891,created_at:"2026-11-01T00:00:00Z"}]}];
 throw Error("Unexpected fixture request");
}
const documentRow={id:doc,revision:1,content:{lines:[{productId:product},{productId:product}]},updated_at:"2026-11-05T00:00:00Z"};
beforeEach(()=>{
 process.env.SUPABASE_URL="https://synthetic.supabase.test";process.env.SUPABASE_SERVICE_ROLE_KEY="synthetic-service-role";
 vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>new Response(JSON.stringify([documentRow]),{status:200,headers:{"content-range":"0-0/1"}})));
 db.mockReset().mockImplementation(async(path:string)=>fixture(path));publishedAt="2026-11-02T01:00:00Z";changed=false;recalculated=false;
});
afterEach(()=>{vi.unstubAllGlobals();delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY});
const list=()=>pricingDocumentsRepository.request<List>(scope,"list",{page:1});
describe("server document status read model",()=>{
 const importId="40000000-0000-4000-8000-000000000001",supplierOwner="50000000-0000-4000-8000-000000000001";
 const datedHistory={id:"dated-history",supplier_product_id:supplier,purchase_price:12345,created_at:"2026-11-02T02:00:00Z",import_id:importId,source:{supplier_id:supplierOwner,mapping:{contract:"purchase-cost-date-v2"}}};
 const historyBatch={supplier_import_ids:{[supplierOwner]:importId},product_snapshots:{},supplier_snapshots:{},recalc_run_id:null,history_only_product_count:1};
 function datedFixture(path:string){
  if(path.startsWith("supplier_product_cost_history?"))return [datedHistory];
  if(path.startsWith("purchase_cost_date_batches_v2?")){
   const url=new URL("https://synthetic.test/"+path);
   expect(url.searchParams.get("status")).toBe("eq.completed");
   expect(url.searchParams.get("or")).toBe(`(supplier_import_ids->>${supplierOwner}.eq.${importId})`);
   return [historyBatch];
  }
  return fixture(path);
 }
 it("ignores a proven history-only batch across reads without hiding actual recalculation changes",async()=>{
  db.mockImplementation(async(path:string)=>datedFixture(path));
  for(let read=0;read<2;read++)expect((await list()).items[0].recalculation).toMatchObject({needsRecalculation:false,changedProductCount:0});
  for(const [path] of db.mock.calls)expect(path).toContain(`company_id=eq.${company}`);
  expect(JSON.stringify(await list())).not.toContain("12345");
  recalculated=true;expect((await list()).items[0].recalculation.changedProductCount).toBe(1);
 });
 it.each([
  {product_snapshots:{[product]:{purchasePrice:67891}}},
  {supplier_snapshots:{[supplier]:{latestCost:67891}}},
  {recalc_run_id:"60000000-0000-4000-8000-000000000001"},
  {history_only_product_count:0},
 ])("keeps history when any no-current-change condition is absent: %j",async(patch)=>{
  db.mockImplementation(async(path:string)=>path.startsWith("purchase_cost_date_batches_v2?")?[{...historyBatch,...patch}]:datedFixture(path));
  expect((await list()).items[0].recalculation.changedProductCount).toBe(1);
 });
 it("does not let an older history-only receipt replace the actual pre-publication cost baseline",async()=>{
  const oldReceipt={...datedHistory,created_at:"2026-11-02T00:30:00Z"};
  const actualBaseline={id:"actual-baseline",supplier_product_id:supplier,purchase_price:67891,created_at:"2026-11-01T00:00:00Z"};
  db.mockImplementation(async(path:string)=>{
   if(path.startsWith("supplier_products?"))return [{id:supplier,baseline:[oldReceipt]}];
   if(path.startsWith("supplier_product_cost_history?"))return path.includes("created_at=lte.")
    ?[oldReceipt,actualBaseline]:[{...actualBaseline,id:"same-current-cost",created_at:"2026-11-02T02:00:00Z"}];
   return datedFixture(path);
  });
  expect((await list()).items[0].recalculation.needsRecalculation).toBe(false);
 });
 it("fails visibly if a dated import has no matching completed same-company batch or its lookup fails",async()=>{
  for(const records of [[],[{...historyBatch,supplier_import_ids:{[supplierOwner]:"foreign-import"}}]]){
   db.mockImplementation(async(path:string)=>path.startsWith("purchase_cost_date_batches_v2?")?records:datedFixture(path));
   await expect(list()).rejects.toThrow("현재가 반영 상태");
  }
  db.mockImplementation(async(path:string)=>{if(path.startsWith("purchase_cost_date_batches_v2?"))throw Error("batch unavailable");return datedFixture(path)});
  await expect(list()).rejects.toThrow("batch unavailable");
 });
 it("persists status across independent reads and only clears after republishing",async()=>{
  expect((await list()).items[0].recalculation.needsRecalculation).toBe(false);changed=true;
  expect((await list()).items[0].recalculation.changedProductCount).toBe(1);recalculated=true;
  expect((await list()).items[0].recalculation.needsRecalculation).toBe(true);publishedAt="2026-11-02T04:00:00Z";
  expect((await list()).items[0].recalculation.needsRecalculation).toBe(false);
 });
 it("scopes every query to authenticated company and RPC-authorized documents without leaking costs",async()=>{
  changed=true;recalculated=true;const result=await list();
  const listUrl=new URL(vi.mocked(fetch).mock.calls[0][0] as string);expect(listUrl.searchParams.get("company_id")).toBe(`eq.${company}`);expect(listUrl.searchParams.has("owner_key")).toBe(false);
  for(const [path] of db.mock.calls)expect(path).toContain(`company_id=eq.${company}`)
  const versionPath=db.mock.calls.find(c=>c[0].startsWith("pricing_documents?"))![0];expect(versionPath).toContain(`id=in.(${doc})`);expect(versionPath).toContain("versions.limit=1");expect(versionPath).toContain("versions.order=version.desc");
  expect(JSON.stringify(result)).not.toContain("67891");expect(JSON.stringify(result)).not.toContain("78912");
 });
 it("uses latest published membership instead of unsaved draft membership",async()=>{
  changed=true;db.mockImplementation(async(path:string)=>path.startsWith("pricing_documents?")?[{id:doc,versions:[{published_at:publishedAt,content:{lines:[{productId:"old-product"}]}}]}]:fixture(path));
  expect((await list()).items[0].recalculation.changedProductCount).toBe(0);
 });
 it("does not read history for an unpublished or empty list",async()=>{
  db.mockImplementation(async(path:string)=>path.startsWith("pricing_documents?")?[{id:doc,versions:[]}]:fixture(path));expect((await list()).items[0].recalculation).toMatchObject({publishedAt:null,needsRecalculation:false});expect(db).toHaveBeenCalledTimes(1);
  vi.mocked(fetch).mockResolvedValueOnce(new Response("[]",{status:200,headers:{"content-range":"*/0"}}));db.mockClear();expect(await list()).toEqual({items:[],total:0});expect(db).not.toHaveBeenCalled();
 });
 it("fails visibly when publication/history is unavailable",async()=>{
  db.mockImplementation(async(path:string)=>{if(path.startsWith("pricing_documents?"))return [];return fixture(path)});await expect(list()).rejects.toThrow("문서가 변경");
  db.mockImplementation(async(path:string)=>{if(path.startsWith("supplier_product_cost_history?"))throw Error("history unavailable");return fixture(path)});await expect(list()).rejects.toThrow("history unavailable");
 });
 it("passes other actions through without status reads",async()=>{db.mockResolvedValue({saved:true});expect(await pricingDocumentsRepository.request(scope,"save",{})).toEqual({saved:true});expect(db).toHaveBeenCalledTimes(1)});
 it("lists another employee's document but keeps writes on the actor-scoped RPC",async()=>{
  const result=await list();expect(result.items).toHaveLength(1);expect((vi.mocked(fetch).mock.calls[0][0] as string)).not.toContain("opaque-author");
  db.mockClear().mockResolvedValue({saved:true});await pricingDocumentsRepository.request(scope,"save",{});
  expect(JSON.parse(db.mock.calls[0][1].body)).toMatchObject({p_company:company,p_actor:scope.actor,p_manager:false,p_action:"save"});
 });
 it("reads another employee's published versions inside the company and rejects a foreign document id",async()=>{
  const version="40000000-0000-4000-8000-000000000001",foreign="50000000-0000-4000-8000-000000000001";
  vi.mocked(fetch).mockImplementation(async(input)=>{
   const url=new URL(String(input));
   if(url.pathname.endsWith("/pricing_documents"))return new Response(url.searchParams.get("id")===`eq.${foreign}`?"[]":JSON.stringify([{id:doc}]),{status:200});
   if(url.pathname.endsWith("/pricing_document_versions"))return new Response(JSON.stringify([{id:version,document_id:doc,version:1,revision:1,content:documentRow.content,published_at:"2026-11-05T00:00:00Z"}]),{status:200});
   throw Error("Unexpected document read");
  });
  const versions=await pricingDocumentsRepository.request<Array<{id:string}>>(scope,"versions",{id:doc});expect(versions).toEqual([expect.objectContaining({id:version})]);
  for(const [input] of vi.mocked(fetch).mock.calls)expect(new URL(String(input)).searchParams.get("company_id")).toBe(`eq.${company}`);
  expect(vi.mocked(fetch).mock.calls.map(call=>String(call[0])).join(" ")).not.toContain(scope.actor);
  await expect(pricingDocumentsRepository.request(scope,"versions",{id:foreign})).rejects.toThrow("Document not found");
 });
 it("keeps more than 100 promotion states available across version history",async()=>{
  const ids=Array.from({length:101},(_,index)=>`60000000-0000-4000-8000-${String(index+1).padStart(12,"0")}`);
  vi.mocked(fetch).mockImplementation(async(input)=>{
   const url=new URL(String(input));
   if(url.pathname.endsWith("/pricing_documents"))return new Response(JSON.stringify([{id:doc}]),{status:200});
   if(url.pathname.endsWith("/pricing_document_versions"))return new Response(JSON.stringify([100,1].map((size,index)=>({id:`70000000-0000-4000-8000-${String(index+1).padStart(12,"0")}`,document_id:doc,version:index+1,revision:index+1,content:{lines:ids.slice(index*100,index*100+size).map(promotionId=>({promotionId}))},published_at:"2026-11-05T00:00:00Z"}))),{status:200});
   if(url.pathname.endsWith("/pricing_promotions")){const selected=(url.searchParams.get("id")||"").slice(4,-1).split(",");return new Response(JSON.stringify(selected.map(id=>({id,stock:1,starts_on:"2026-01-01",ends_on:"2026-12-31"}))),{status:200});}
   throw Error("Unexpected document read");
  });
  const versions=await pricingDocumentsRepository.request<Array<{unavailablePromotions:string[]}>>(scope,"versions",{id:doc});
  expect(versions).toHaveLength(2);expect(versions.every(version=>version.unavailablePromotions.length===0)).toBe(true);
  expect(vi.mocked(fetch).mock.calls.filter(call=>String(call[0]).includes("pricing_promotions?"))).toHaveLength(2);
 });
 it("refuses truncated history rather than returning clean status",async()=>{
  const page=Array.from({length:500},()=>({product_id:product,before_value:{price:1,applied_cost:1},after_value:{price:2,applied_cost:2},run:{created_at:"2026-11-02T03:00:00Z"}}));
  db.mockImplementation(async(path:string)=>path.startsWith("price_recalc_changes?")?page:fixture(path));await expect(list()).rejects.toThrow("이력이 많아");
 });
});
