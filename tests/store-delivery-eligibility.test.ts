import {afterEach,beforeEach,expect,it,vi} from "vitest";
const db=vi.hoisted(()=>vi.fn());vi.mock("@/lib/store",()=>({supabaseRequest:db}));
import {getStoreDeliveryEligibility} from "../lib/pricing/store-delivery-eligibility";
import {matchOrderDeliveryArea} from "../domains/order/delivery-eligibility";
import {KOREAN_ADMINISTRATIVE_AREAS as known,KOREAN_GENERAL_GU_AREAS as gu} from "../lib/korean-administrative-areas";
const company="company",customer="customer",territory="territory";
let base:string|null,detail:string|null,linked:string|null,days:number[]|null,customerDays:number[]|null,settings:boolean;
let territories:Array<{id:string;name:string;is_active:boolean}>,areas:Array<{territory_id:string;administrative_area:string}>;
beforeEach(()=>{
  vi.clearAllMocks();vi.stubEnv("STORE_ORDER_ADDRESS_VERIFICATION_ENABLED","true");vi.stubEnv("FEATURE_STORE_ORDER_ADDRESS_VERIFICATION_COMPANY_IDS",company);
  base="서울특별시 강남구 합성로 1";detail="1층";linked=territory;days=[1,3];customerDays=null;settings=true;
  territories=[{id:territory,name:"합성 권역",is_active:true}];areas=[{territory_id:territory,administrative_area:"서울특별시 강남구"}];
  db.mockImplementation(async(path:string)=>{
    expect(path).toContain(`company_id=eq.${company}`);
    if(path.includes("offset=")&&!path.includes("offset=0"))return [];
    if(path.startsWith("normalized_customers?")){expect(path).toContain(`id=eq.${customer}`);return [{delivery_base_address:base,delivery_address_detail:detail,delivery_territory_id:linked,address:"서울특별시 강남구 옛주소"}];}
    if(path.startsWith("delivery_territories?"))return territories;
    if(path.startsWith("delivery_territory_areas?"))return areas;
    if(path.startsWith("store_order_customer_rules?"))return [{delivery_weekdays:customerDays}];
    if(path.startsWith("store_order_territory_rules?"))return [{delivery_weekdays:days}];
    if(path.startsWith("store_order_settings?"))return settings?[{company_id:company}]:[];
    throw new Error("unexpected query");
  });
});
afterEach(()=>vi.unstubAllEnvs());
it("uses stored separated basic address and actual weekdays within signed company/customer scope",async()=>{
  expect(await getStoreDeliveryEligibility(company,customer)).toMatchObject({eligible:true,territoryId:territory,weekdays:[1,3],baseAddress:base});
  expect(db.mock.calls.every(([path])=>!path.startsWith("rpc/"))).toBe(true);
});
it("uses customer weekday override before territory weekdays",async()=>{
  customerDays=[2];expect((await getStoreDeliveryEligibility(company,customer)).weekdays).toEqual([2]);
  customerDays=[];expect((await getStoreDeliveryEligibility(company,customer)).reason).toBe("weekdays_unconfigured");
});
it.each([null,""])("blocks absent basic address %s without guessing from old combined address",async value=>{
  base=value;expect((await getStoreDeliveryEligibility(company,customer)).reason).toBe("address_unknown");
});
it("ignores geography in the detail address and requires detail",async()=>{
  base="서울특별시 서초구 합성로 1";detail="서울특별시 강남구 1층";
  expect((await getStoreDeliveryEligibility(company,customer)).reason).toBe("outside_area");
  detail=null;expect((await getStoreDeliveryEligibility(company,customer)).reason).toBe("address_unknown");
});
it("blocks no active territory, overlapping territories, unknown addresses and missing weekdays",async()=>{
  territories[0].is_active=false;expect((await getStoreDeliveryEligibility(company,customer)).reason).toBe("territory_unconfigured");
  territories[0].is_active=true;territories.push({id:"second",name:"overlap",is_active:true});areas.push({territory_id:"second",administrative_area:"서울특별시 강남구"});
  expect((await getStoreDeliveryEligibility(company,customer)).reason).toBe("ambiguous_area");territories.pop();
  base="서울특별시 알수없는구 도로";expect((await getStoreDeliveryEligibility(company,customer)).reason).toBe("address_unknown");
  base="서울특별시 강남구 도로";days=[];expect((await getStoreDeliveryEligibility(company,customer)).reason).toBe("weekdays_unconfigured");
});
it.each([null,"different"])("requires customer territory connection %s without updating customer master",async value=>{
  linked=value;expect((await getStoreDeliveryEligibility(company,customer)).reason).toBe("territory_link_required");
});
it("does not require a company settings row and fails closed on missing address SQL",async()=>{
  settings=false;expect((await getStoreDeliveryEligibility(company,customer)).eligible).toBe(true);
  db.mockRejectedValue(new Error("column missing/private DB details"));expect(await getStoreDeliveryEligibility(company,customer)).toEqual({eligible:false,reason:"verification_unavailable",weekdays:[]});
});
it("reads past a server row cap so the second matching territory cannot disappear",async()=>{
  const fallback=db.getMockImplementation()!;
  db.mockImplementation(async(path:string)=>{
    if(path.startsWith("delivery_territories?")){
      if(path.endsWith("offset=0"))return territories;
      if(path.endsWith("offset=1"))return [{id:"second",name:"second",is_active:true}];
      return [];
    }
    return fallback(path);
  });areas.push({territory_id:"second",administrative_area:"서울특별시 강남구"});
  expect((await getStoreDeliveryEligibility(company,customer)).reason).toBe("ambiguous_area");
});
it("does not query new columns when OFF or for a non-allowlisted company even if pending flag is ON",async()=>{
  vi.stubEnv("STORE_ORDER_PENDING_DELIVERY_ENABLED","true");vi.stubEnv("STORE_ORDER_ADDRESS_VERIFICATION_ENABLED","false");
  expect((await getStoreDeliveryEligibility(company,customer)).eligible).toBe(false);expect(db).not.toHaveBeenCalled();
  vi.stubEnv("STORE_ORDER_ADDRESS_VERIFICATION_ENABLED","true");vi.stubEnv("FEATURE_STORE_ORDER_ADDRESS_VERIFICATION_COMPANY_IDS","other");
  expect((await getStoreDeliveryEligibility(company,customer)).eligible).toBe(false);expect(db).not.toHaveBeenCalled();
});
it("matches the actual general-gu unit; city+gu overlap blocks rather than selecting first",()=>{
  const match=(base:string,keys:string[])=>matchOrderDeliveryArea(base,keys.map((area,i)=>({id:String(i),name:area,areas:[area]})),known,gu);
  expect(match("경기도 성남시 분당구 도로 1",["경기도 성남시 분당구"]).eligible).toBe(true);
  expect(match("경기도 성남시 수정구 도로 1",["경기도 성남시 분당구"]).reason).toBe("outside_area");
  expect(match("경기도 성남시 분당구 도로 1",["경기도 성남시","경기도 성남시 분당구"]).reason).toBe("ambiguous_area");
  expect(match("경기도 성남시 도로 1",["경기도 성남시 분당구"]).eligible).toBe(false);
  expect(match("경기도 성남시 분당구 도로 1",["경기도 성남시 엉뚱구"]).eligible).toBe(false);
});

it("does not let an invalid unrelated locality disable a verified store",()=>{
  const result=matchOrderDeliveryArea("서울특별시 강남구 도로 1",[{id:"good",name:"good",areas:["서울특별시 강남구"]},{id:"bad",name:"bad",areas:["경기도 성남시 엉뚱구"]}],known,gu);
  expect(result.eligible).toBe(true);
});

it("blocks an address changed after a successful read until customer territory is explicitly reconnected",async()=>{
  expect((await getStoreDeliveryEligibility(company,customer)).eligible).toBe(true);
  territories.push({id:"new-area",name:"new area",is_active:true});
  areas.push({territory_id:"new-area",administrative_area:"서울특별시 서초구"});
  base="서울특별시 서초구 합성로 2";
  expect((await getStoreDeliveryEligibility(company,customer)).reason).toBe("territory_link_required");
  expect(linked).toBe(territory);
});
