import { beforeEach,afterEach,expect,it,vi } from "vitest";
import { NextRequest } from "next/server";
import { parseDeliveryConfirmation } from "../domains/order/confirm-delivery-date";
const m=vi.hoisted(()=>({auth:vi.fn(),enabled:vi.fn(),list:vi.fn(),confirm:vi.fn()}));
vi.mock("../lib/auth",()=>({getRequestAuthScope:m.auth}));
vi.mock("../lib/pricing/pending-order-inbox",()=>({pendingOrderInboxEnabled:m.enabled,listPendingOrders:m.list,confirmPendingOrder:m.confirm}));
vi.mock("../lib/pricing/feature",()=>({priceSheetsEnabled:()=>true}));
vi.mock("../lib/pricing/store-order-feature",()=>({storeOrderingEnabled:()=>true}));
import { GET,POST } from "../app/api/pricing-pending-orders/route";
const company="00000000-0000-4000-8000-000000000001",member="20000000-0000-4000-8000-000000000001",user="30000000-0000-4000-8000-000000000001";
const input={orderId:"40000000-0000-4000-8000-000000000001",requestId:"50000000-0000-4000-8000-000000000001",expectedRevision:1,deliveryDate:"2099-01-05",action:"confirm"};
const request=(body:unknown,origin="https://test")=>new NextRequest("https://test/api/pricing-pending-orders",{method:"POST",headers:{origin},body:JSON.stringify(body)});
const auth={ok:true,companyId:company,customerSession:{workspaceRole:"owner",companyMemberId:member,userId:user}};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("STORE_ORDER_DELIVERY_CONFIRMATION_ENABLED","true");m.auth.mockResolvedValue(auth);m.enabled.mockReturnValue(true);m.list.mockResolvedValue({items:[],page:1,hasMore:false});});
afterEach(()=>vi.unstubAllEnvs());
it("keeps OFF ahead of session/database access",async()=>{
  vi.stubEnv("STORE_ORDER_DELIVERY_CONFIRMATION_ENABLED","false");
  expect((await POST(request(input))).status).toBe(404);expect(m.auth).not.toHaveBeenCalled();expect(m.confirm).not.toHaveBeenCalled();
});
it("filters a list by the authenticated company rather than a requested company",async()=>{
  const r=await GET(new NextRequest("https://test/api/pricing-pending-orders?companyId=forged&page=2"));
  expect(r.status).toBe(200);expect(m.list).toHaveBeenCalledExactlyOnceWith(company,2);expect(r.headers.get("cache-control")).toBe("no-store");
});
it("blocks staff, logged out users and admin preview writes",async()=>{
  m.auth.mockResolvedValue({...auth,customerSession:{...auth.customerSession,workspaceRole:"staff"}});
  expect((await GET(new NextRequest("https://test/api/pricing-pending-orders"))).status).toBe(403);
  m.auth.mockResolvedValue({ok:false});expect((await POST(request(input))).status).toBe(401);
  m.auth.mockResolvedValue({ok:true,companyId:company,customerSession:null,adminSession:{email:"preview@example.test"}});
  expect((await POST(request(input))).status).toBe(403);expect(m.confirm).not.toHaveBeenCalled();
});
it("uses only the session actor for cancellation",async()=>{
  const body={...input,action:"cancel",deliveryDate:null,companyId:"forged",memberId:"forged",userId:"forged"};
  expect((await POST(request(body))).status).toBe(200);
  expect(m.confirm).toHaveBeenCalledExactlyOnceWith({orderId:input.orderId,requestId:input.requestId,expectedRevision:1,deliveryDate:null,action:"cancel",companyId:company,memberId:member,userId:user});
});
it("rejects a foreign origin and invalid dates without writing",async()=>{
  expect((await POST(request(input,"https://other"))).status).toBe(403);
  expect((await POST(request({...input,deliveryDate:"invalid"}))).status).toBe(400);
  expect((await POST(request({...input,deliveryDate:"2000-01-01"}))).status).toBe(400);expect(m.confirm).not.toHaveBeenCalled();
});
it("validates explicit dates and leaves cancellation date null",()=>{
  const now=new Date("2026-11-10T00:00:00Z");
  expect(parseDeliveryConfirmation({...input,deliveryDate:"2026-11-11"},now).deliveryDate).toBe("2026-11-11");
  expect(()=>parseDeliveryConfirmation(input,now)).toThrow("1년");
  expect(parseDeliveryConfirmation({...input,action:"cancel",deliveryDate:null},now).deliveryDate).toBeNull();
});
