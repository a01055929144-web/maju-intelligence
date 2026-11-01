import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prepareCustomerItemFile } from "../application/customer/prepare-customer-item-file";
const mocks=vi.hoisted(()=>({auth:vi.fn(),capability:vi.fn(),db:vi.fn()}));
vi.mock("../lib/auth",()=>({getRequestAuthScope:mocks.auth,scopeHasCapability:mocks.capability}));
vi.mock("../lib/store",()=>({supabaseRequest:mocks.db}));
import {GET,POST} from "../app/api/customers/items/import/route";
const company="00000000-0000-4000-8000-000000000001";
const refs={customers:[{id:"00000000-0000-4000-8000-000000000002",name:"합성 매장"}],products:[{id:"00000000-0000-4000-8000-000000000003",code:"001"}]};
const values={customerName:"합성 매장",productCode:"001",salesUnit:"kg",lastPrice:"1,200원",lastDate:"2026-10-30",taxType:"과세",priceIncludesTax:"별도"};
const row={id:"row-2",sourceRowNumber:2,originalValues:{...values,lastPrice:"1,100원"},values};
const request=(body:unknown={fileName:"synthetic.csv",editedRows:[row]})=>new NextRequest("http://localhost/api/customers/items/import",{method:"POST",body:JSON.stringify(body)});
beforeEach(()=>{
 vi.clearAllMocks();
 for(const flag of ["CUSTOMER_ITEMS_IMPORT_ENABLED","PRODUCT_IMPORT_AUDIT_V2_ENABLED","IMPORT_ROW_EDITOR_ENABLED","PRODUCT_IMPORT_TARGETS_ENABLED"])vi.stubEnv(flag,"true");
 vi.stubEnv("HOLD_MODULES_ENABLED_COMPANY_IDS",company);
 mocks.auth.mockResolvedValue({ok:true,companyId:company,customerSession:{name:"합성 작성자"}});mocks.capability.mockReturnValue(true);
 mocks.db.mockImplementation((url:string)=>url.startsWith("normalized_customers?")?Promise.resolve(refs.customers.map(c=>({id:c.id,customer_name:c.name}))):url.startsWith("product_catalog?")?Promise.resolve(refs.products.map(p=>({id:p.id,product_code:p.code}))):Promise.resolve({applied:1,skipped:0,replayed:false}));
});
afterEach(()=>vi.unstubAllEnvs());

it("resolves existing records and preserves original/edited values separately",()=>{
 const result=prepareCustomerItemFile([row],refs);
 expect(result.rows[0]).toEqual({customerId:refs.customers[0].id,productId:refs.products[0].id,salesUnit:"kg",lastPrice:1200,lastDate:"2026-10-30",taxType:"taxable",priceIncludesTax:false});
 expect(result.auditRows[0].originalValues.lastPrice).toBe("1,100원");
 expect(result.auditRows[0].values.lastPrice).toBe("1,200원");
 expect(prepareCustomerItemFile([{...row,sourceRowNumber:1002}],refs).auditRows[0].sourceRowNumber).toBe(1002);
});
it("refuses ambiguous/missing matches, forged extra fields and duplicate source rows",()=>{
 expect(()=>prepareCustomerItemFile([row],{...refs,customers:[...refs.customers,...refs.customers]})).toThrow(/중복/);
 expect(()=>prepareCustomerItemFile([row],{...refs,products:[]})).toThrow(/없거나/);
 expect(()=>prepareCustomerItemFile([{...row,originalValues:{...values,phone:"private"}}],refs)).toThrow();
 expect(()=>prepareCustomerItemFile([row,row],refs)).toThrow();
 expect(()=>prepareCustomerItemFile([{...row,values:{...values,lastPrice:""}}],refs)).toThrow(/실제 단가/);
 expect(()=>prepareCustomerItemFile([{...row,values:{...values,lastPrice:"1,2,3"}}],refs)).toThrow(/원 단위/);
});
it("does not assume tax when missing",()=>{
 expect(prepareCustomerItemFile([{...row,values:{...values,taxType:"",priceIncludesTax:""}}],refs).rows[0]).toMatchObject({taxType:"unknown",priceIncludesTax:null});
});
it("requires every file/audit flag before reading or saving file data",async()=>{
 for(const flag of ["CUSTOMER_ITEMS_IMPORT_ENABLED","PRODUCT_IMPORT_AUDIT_V2_ENABLED","IMPORT_ROW_EDITOR_ENABLED","PRODUCT_IMPORT_TARGETS_ENABLED"]){
  vi.stubEnv(flag,"false");
  expect((await GET(new NextRequest("http://localhost/api/customers/items/import"))).status).toBe(404);
  expect((await POST(request())).status).toBe(404);
  vi.stubEnv(flag,"true");
 }
 expect(mocks.db).not.toHaveBeenCalled();
});
it("uses session company and actor in one audited save; includes no contact fields",async()=>{
 expect((await GET(new NextRequest("http://localhost/api/customers/items/import"))).status).toBe(200);
 const response=await POST(request());expect(response.status).toBe(200);
 const call=mocks.db.mock.calls.find(([url])=>url==="rpc/import_customer_items_audited");
 expect(call).toBeDefined();
 const body=JSON.parse(call![1].body);
 expect(body).toMatchObject({p_company:company,p_actor:"합성 작성자",p_rows:[{last_price:1200}],p_audit:[{source_row_number:2,raw_values:row.originalValues,normalized_values:row.values}]});
 expect(body.p_key).toMatch(/^customer-items:[0-9a-f]{64}$/);
 expect(mocks.db.mock.calls.some(([url])=>url==="rpc/import_customer_items")).toBe(false);
 expect(mocks.db.mock.calls.filter(([url])=>String(url).includes("?company_id=")).every(([url])=>String(url).includes(company))).toBe(true);
 expect(mocks.db.mock.calls.map(([url])=>url).join(" ")).not.toMatch(/phone|address/);
});
it("blocks anonymous/unauthorized access and keeps raw DB failures private",async()=>{
 mocks.auth.mockResolvedValueOnce({ok:false});expect((await GET(new NextRequest("http://localhost/api/customers/items/import"))).status).toBe(401);
 mocks.capability.mockReturnValueOnce(false);expect((await POST(request())).status).toBe(403);
 mocks.db.mockRejectedValue(new Error("secret business price"));
 const response=await POST(request());expect(response.status).toBe(409);expect(await response.text()).not.toContain("secret");
});
