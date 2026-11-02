vi.mock("@/domains/order/order-rules",()=>import("../domains/order/order-rules"));
vi.mock("@/domains/pricing/document",()=>import("../domains/pricing/document"));
vi.mock("@/lib/pricing/storefront",()=>import("../lib/pricing/storefront"));
vi.mock("@/lib/pricing/storefront-public",()=>import("../lib/pricing/storefront-public"));
vi.mock("@/lib/pricing/store-link-token",()=>({verifyStoreLinkToken:()=>({id:"link",hash:"hash"})}));
vi.mock("@/lib/feature-flags",()=>import("../lib/feature-flags"));
vi.mock("@/lib/pricing/feature",()=>import("../lib/pricing/feature"));
vi.mock("@/lib/pricing/store-order-feature",()=>import("../lib/pricing/store-order-feature"));
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
const {db}=vi.hoisted(()=>({db:vi.fn()}));
vi.mock("@/lib/store",()=>({supabaseRequest:db}));
vi.mock("../lib/pricing/store-link-token",()=>({verifyStoreLinkToken:()=>({id:"link",hash:"hash"})}));
import {readStorefront} from "../lib/pricing/storefront";
import {POST,PATCH,PUT} from "../app/api/storefront/route";
const company="00000000-0000-4000-8000-000000000001",product="00000000-0000-4000-8000-000000000002";
function fixture(path:string){
 if(path.startsWith("storefront_links?"))return [{id:"link",company_id:company,customer_id:"customer",document_version_id:"version",expires_at:"2099-12-31",revoked_at:null,can_order:true}];
 if(path.startsWith("pricing_document_versions?"))return [{id:"version",version:1,published_at:"2026-01-01",content:{kind:"sheet",title:"합성",companyName:"합성",footer:"",showPrice:true,validUntil:"2099-12-31",lines:[{productId:product,unit:"개",displayName:"상품",visible:true,price:1200,taxType:"exempt"}]}}];
 if(path.startsWith("normalized_customers?"))return [{id:"customer",customer_name:"합성",delivery_territory_id:"territory"}];
 if(path.startsWith("product_catalog?"))return [{id:product,is_active:true,order_pricing_mode:"fixed"}];
 if(path.startsWith("store_order_territory_rules?"))return [{delivery_weekdays:[0,1,2,3,4,5,6],cutoff_time:"23:59:00"}];
 return [];
}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("PRICE_SHEETS_ENABLED","true");vi.stubEnv("STORE_ORDERING_ENABLED","true");vi.stubEnv("STORE_LINK_SECRET","synthetic-test-secret-32-characters-long");vi.stubEnv("STORE_PUBLIC_BASE_URL","https://store.example.test");vi.stubEnv("FEATURE_PRICING_COMPANY_IDS",company);vi.stubEnv("FEATURE_STORE_ORDERING_COMPANY_IDS",company);vi.stubEnv("HOLD_MODULES_ENABLED_COMPANY_IDS","");db.mockImplementation(async(path:string)=>fixture(path))});
afterEach(()=>vi.unstubAllEnvs());
function request(method:string){return new NextRequest("https://store.example.test/api/storefront",{method,headers:{origin:"https://store.example.test"},body:JSON.stringify({token:"signed",companyId:"forged",productId:product,isFavorite:true,isHidden:false,willNotOrder:false,deliveryDate:"2099-01-01",memo:"",idempotencyKey:"00000000-0000-4000-8000-000000000003",lines:[{productId:product,quantity:1}]})})}
describe("signed-link company feature gates",()=>{
 it.each(["FEATURE_PRICING_COMPANY_IDS","FEATURE_STORE_ORDERING_COMPANY_IDS"])("blocks all reads and writes for excluded issuing company via %s",async flag=>{
  vi.stubEnv(flag,"forged");vi.stubEnv("HOLD_MODULES_ENABLED_COMPANY_IDS",company);
  for(const [method,handler] of [["POST",POST],["PATCH",PATCH],["PUT",PUT]] as const){db.mockClear();expect((await handler(request(method))).status).toBe(404);expect(db).toHaveBeenCalledTimes(1);expect(db.mock.calls[0][0]).toMatch(/^storefront_links\?/);}
 });
 it("permits a listed company with HOLD off and keeps verified scope",async()=>{
  const store=await readStorefront("signed","2099-01-01");expect(store?.companyId).toBe(company);expect(store?.lines[0].unitPrice).toBe(1200);
  expect((await POST(request("POST"))).status).toBe(200);
 });
 it("global OFF rejects before link lookup",async()=>{vi.stubEnv("PRICE_SHEETS_ENABLED","false");expect((await POST(request("POST"))).status).toBe(404);expect(db).not.toHaveBeenCalled()});
});
