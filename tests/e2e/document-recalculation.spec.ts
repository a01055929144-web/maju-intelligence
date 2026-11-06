import {expect,test,type BrowserContext} from "@playwright/test";
const company="00000000-0000-4000-8000-000000000001",id="10000000-0000-4000-8000-000000000001",productId="20000000-0000-4000-8000-000000000001";
for(const width of [1440,390])test(`server document recalculation survives fresh browser at ${width}px`,async({browser},info)=>{
 let changed=false,published=false,revision=1,failed=false;
 let content={kind:"sheet",title:"합성 단가표",companyName:"합성 유통",contact:"",recipient:"",footer:"",validUntil:"2099-12-31",theme:"blue",layout:"auto",showPrice:true,showBrand:true,showSpec:true,lines:[{productId,displayName:"합성 상품",brand:"",spec:"1kg",unit:"봉",price:100,taxType:"exempt",visible:true,promotionId:null,startsOn:null,endsOn:null,remaining:null,badge:""}]};
 const draft=()=>({id,revision,content,updatedAt:"2026-11-02T01:00:00Z",recalculation:{publishedAt:published?"2026-11-02T04:00:00Z":"2026-11-02T01:00:00Z",needsRecalculation:changed&&!published,changedProductCount:changed&&!published?1:0}});
 const version=()=>({id:"30000000-0000-4000-8000-000000000001",documentId:id,version:published?2:1,revision,publishedAt:draft().recalculation.publishedAt,content,unavailablePromotions:[],promotionStock:{}});
 const state=()=>({groups:[],categories:[],items:[],defaultMargin:0,defaultRounding:10,pendingCount:0,total:0,page:1,pageSize:50,lastBatch:changed?"50000000-0000-4000-8000-000000000001":null,restored:false});
 async function setup(context:BrowserContext){
  const login=await context.request.post("http://127.0.0.1:3100/api/customer/login",{data:{email:"ci-owner@example.test",password:"ci-owner-layout-password-2026"}});expect(login.ok()).toBeTruthy();
  await context.route("**/api/price-sheets/costs*",async route=>{if(route.request().method()==="POST"){changed=true;return route.fulfill({json:{saved:1}})}return route.fulfill({json:{products:[{id:productId,code:"ERP-1",name:"합성 상품",spec:"1kg",unit:"봉",cost:changed?200:100}],suppliers:[]}})});
  await context.route(/\/api\/price-sheets(?:\?|$)/,route=>route.fulfill({json:state()}));
  await context.route("**/api/pricing-documents*",async route=>{
   const request=route.request(),url=new URL(request.url()),body=request.method()==="POST"?request.postDataJSON():{};const action=body.action||url.searchParams.get("action")||"list";
   if(action==="list")return route.fulfill({status:failed?503:200,json:failed?{message:"합성 이력 조회 실패. 다시 시도해 주세요."}:{result:{items:[draft()],total:1},manager:true}});
   let result:unknown=[];
   if(action==="catalog")result={items:[{id:productId,name:"합성 상품",displayName:"합성 상품",brand:"",spec:"1kg",unit:"봉",price:changed?200:100,cost:changed?200:100,taxType:"exempt"}],total:1};
   if(action==="versions")result=[version()];
   if(action==="profile")result={revision:0,content:{companyName:"합성 유통",contact:"",footer:""}};
   if(action==="save"){revision++;content=body.content;result=draft()}
   if(action==="publish"){published=true;result=version()}
   return route.fulfill({json:{result,manager:true}});
  });
 }
 const context=await browser.newContext({baseURL:"http://127.0.0.1:3100",viewport:{width,height:900}});await setup(context);const page=await context.newPage();
 try{
  await page.goto("/revenue/pricing/documents");await expect(page.getByText("0건 · 0개 품목",{exact:true})).toBeVisible();
  await page.goto("/revenue/pricing");await page.getByRole("button",{name:"전체",exact:true}).click();await page.getByRole("button",{name:"수정",exact:true}).click();await page.getByRole("spinbutton",{name:"합성 상품 변경 후 매입가 수정"}).fill("200");await page.getByRole("button",{name:"③ 저장 (1건)",exact:true}).click();await expect(page.getByText(/매입가 1건 저장/)).toBeVisible();await expect(page.getByRole("link",{name:/합성 단가표 · 1개 품목 다시 계산 필요/})).toBeVisible();
  expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith("maju:pricing-cost-changes:")||k.startsWith("maju:pricing-reviewed:")))).toBe(false);
  const fresh=await browser.newContext({baseURL:"http://127.0.0.1:3100",viewport:{width,height:900}});await setup(fresh);const other=await fresh.newPage();
  try{
   await other.addInitScript(({company,id})=>{localStorage.setItem(`maju:pricing-reviewed:${company}:1`,JSON.stringify([id]))},{company,id});
   await other.goto("/revenue/pricing/documents");await expect(other.getByText("1건 · 1개 품목",{exact:true})).toBeVisible();await other.getByRole("checkbox",{name:"합성 단가표 선택",exact:true}).check();await other.getByRole("button",{name:"다시 계산",exact:true}).click();await expect(other.getByText(/1개 문서 초안을 현재 판매가로 갱신/)).toBeVisible();await expect(other.getByText("1건 · 1개 품목",{exact:true})).toBeVisible();
   expect(await other.evaluate(()=>document.documentElement.scrollWidth>innerWidth+3)).toBe(false);await other.screenshot({path:info.outputPath(`document-stale-${width}.png`),fullPage:true});
   await other.getByRole("button",{name:"합성 단가표",exact:true}).click();await other.getByRole("button",{name:"판매가 버전 확정",exact:true}).click();await expect(other.getByRole("status").filter({hasText:/버전 2.*확정했습니다/})).toBeVisible();await other.getByRole("button",{name:"← 문서 목록",exact:true}).click();await expect(other.getByText("0건 · 0개 품목",{exact:true})).toBeVisible();
   await other.goto("/revenue/pricing");await expect(other.getByText("다시 계산할 문서나 변경 후보와 연결된 문서가 없습니다.",{exact:true})).toBeVisible();
   failed=true;await other.goto("/revenue/pricing/documents");await expect(other.getByRole("alert").filter({hasText:"합성 이력 조회 실패"}).first()).toBeVisible();failed=false;await other.getByRole("button",{name:"다시 시도",exact:true}).last().click();await expect(other.getByText("0건 · 0개 품목",{exact:true})).toBeVisible();
  }finally{await fresh.close()}
 }finally{await context.close()}
});

