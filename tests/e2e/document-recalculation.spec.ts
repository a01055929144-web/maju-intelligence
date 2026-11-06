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



// Margin settings use the same existing pricing command/recalculation flow.
for (const width of [1440, 390]) for (const failure of ["category-and-recalculate", "create-response"] as const) test(`margin group paths and retry checkpoints ${failure} at ${width}px`, async ({ page }, info) => {
  const groupId = "60000000-0000-4000-8000-000000000001", createdId = "60000000-0000-4000-8000-000000000002";
  const category = "농산 > 채소류 > 조미채소", legacy = "회사 자체 > 기존 분류", other = "공산품 > 소스";
  const groups = [{ id: groupId, name: "합성 기존 그룹", margin: 12, rounding: 10 }];
  let categories = [{ category, groupId }, { category: legacy, groupId }], pendingCount = 0, groupCreates = 0, categoryAttempts = 0, recalculateAttempts = 0;
  let categoryFailed = false, recalculateFailed = false, createFailed = false;
  const seenPages = new Set<number>(), commands: Record<string, unknown>[] = [];
  const products = Array.from({ length: 7 }, (_, index) => ({ id: `20000000-0000-4000-8000-${String(index + 1).padStart(12,"0")}`, name: `합성 상품 ${index + 1}`, category: index === 4 ? other : index === 6 ? `${category} > 하위` : category,
    groupId: index === 3 || index === 4 ? groupId : null, itemMargin: index === 2 ? 0 : null, directPrice: index === 1 ? 0 : null,
    cost: 1000, price: 1200, appliedCost: 1000, appliedMargin: 12, appliedRounding: 10, active: index !== 5 }));
  const originalProducts = JSON.stringify(products);
  const state = (pageNumber: number) => ({ groups, categories, items: products.slice((pageNumber-1)*2,pageNumber*2), defaultMargin: 10, defaultRounding: 10, pendingCount, total: products.length, page: pageNumber, pageSize: 2, lastBatch: null, restored: false });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.setViewportSize({ width, height: 1000 });
  await page.route(/\/api\/price-sheets(?:\?|$)/, async route => {
    const number = Number(new URL(route.request().url()).searchParams.get("page") || 1); seenPages.add(number);
    if (route.request().method() === "POST") {
      const command = route.request().postDataJSON(); commands.push(command);
      if (command.action === "group") {
        if (!command.id) { groupCreates++; groups.push({ id: createdId, name: command.name, margin: command.margin, rounding: command.rounding }); }
        else Object.assign(groups.find(group => group.id === command.id)!, { name: command.name, margin: command.margin, rounding: command.rounding });
        pendingCount = 1;
        if (failure === "create-response" && !createFailed) { createFailed = true; return route.fulfill({ status: 503, json: { message: "합성 생성 응답 유실" } }); }
      }
      if (command.action === "category") {
        categoryAttempts++;
        if (failure === "category-and-recalculate" && !categoryFailed) { categoryFailed = true; return route.fulfill({ status: 503, json: { message: "합성 분류 연결 실패" } }); }
        categories = categories.filter(link => link.category !== command.category);
        if (command.groupId) categories.push({ category: command.category, groupId: command.groupId });
      }
      if (command.action === "recalculate") {
        recalculateAttempts++;
        if (failure === "category-and-recalculate" && !recalculateFailed) { recalculateFailed = true; return route.fulfill({ status: 503, json: { message: "합성 판매가 반영 실패" } }); }
        pendingCount = 0;
      }
    }
    return route.fulfill({ json: state(number) });
  });
  page.on("dialog", dialog => dialog.accept());
  await page.goto("/revenue/pricing/margins");
  await page.locator("summary").filter({ hasText: "③ 고급" }).click();
  const panel = page.getByRole("region", { name: "마진 그룹 만들기·수정", exact: true });
  await expect(panel.getByRole("button", { name: "분류·상품 수 다시 조회", exact: true })).toBeEnabled();
  await expect(panel.getByRole("checkbox", { name: `마진 분류 ${category}`, exact: true })).toBeVisible();
  expect(seenPages.has(4)).toBe(true);
  await panel.getByRole("textbox", { name: "마진 그룹 이름", exact: true }).fill("합성 새 그룹");
  await panel.getByRole("spinbutton", { name: "그룹 마진율", exact: true }).fill("0");
  await panel.getByRole("textbox", { name: "마진 적용 분류 검색", exact: true }).fill("농산 조미");
  await panel.getByRole("combobox", { name: "마진 대분류 필터", exact: true }).selectOption("농산");
  await panel.getByRole("combobox", { name: "마진 중분류 필터", exact: true }).selectOption("채소류");
  await panel.getByRole("combobox", { name: "마진 소분류 필터", exact: true }).selectOption("조미채소");
  await panel.getByRole("checkbox", { name: `마진 분류 ${category}`, exact: true }).check();
  const summary = panel.getByLabel("선택 분류와 적용 상품 요약", { exact: true });
  await expect(summary).toContainText("선택 분류 1개 · 분류의 활성 상품 4개");
  await expect(summary).toContainText("실제 그룹 마진 대상 1개");
  const save = panel.getByRole("button", { name: "그룹·분류 저장하고 판매가 반영", exact: true });
  if (width === 390) expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await save.click();
  await expect(page.getByRole("alert").filter({ hasText: failure === "create-response" ? "합성 생성 응답 유실" : "합성 분류 연결 실패" })).toBeVisible();
  expect(groupCreates).toBe(1);
  await page.reload();
  await page.locator("summary").filter({ hasText: "③ 고급" }).click();
  if (failure === "create-response") {
    await expect(save).toBeDisabled();
    await panel.getByRole("button", { name: "생성 결과 다시 조회", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "이미 생성된 그룹" })).toBeVisible();
  }
  await expect(save).toBeEnabled();
  await expect(panel.getByRole("textbox", { name: "마진 그룹 이름", exact: true })).toHaveValue("합성 새 그룹");
  await save.click();
  if (failure === "category-and-recalculate") {
    await expect(page.getByRole("alert").filter({ hasText: "합성 판매가 반영 실패" })).toBeVisible();
    await expect(panel.getByLabel("마진 그룹 저장 단계")).toContainText("2. 분류 연결: 완료");
    await expect(save).toBeEnabled(); await save.click();
  }
  await expect(page.getByRole("status").filter({ hasText: "그룹·분류 연결을 저장하고 판매가 반영을 마쳤습니다" })).toBeVisible();
  expect(groupCreates).toBe(1);
  expect(categories).toContainEqual({ category, groupId: createdId });
  expect(categories).toContainEqual({ category: legacy, groupId });
  expect(categoryAttempts).toBe(failure === "category-and-recalculate" ? 2 : 1);
  await panel.getByRole("button", { name: "합성 기존 그룹 · 12% · 10원 올림", exact: true }).click();
  await expect(panel.getByRole("checkbox", { name: `마진 분류 ${legacy}`, exact: true })).toBeChecked();
  await expect(summary).toContainText("선택 분류 1개 · 분류의 활성 상품 0개");
  await expect(summary).toContainText("실제 그룹 마진 대상 2개");
  await panel.getByRole("spinbutton", { name: "그룹 마진율", exact: true }).fill("15");
  await expect(save).toBeEnabled(); await save.click();
  await expect(page.getByRole("status").filter({ hasText: "그룹·분류 연결을 저장하고 판매가 반영을 마쳤습니다" })).toBeVisible();
  expect(groupCreates).toBe(1); expect(groups.find(group => group.id === groupId)?.margin).toBe(15);
  expect(JSON.stringify(products)).toBe(originalProducts);
  expect(commands.every(command => ["group", "category", "recalculate"].includes(String(command.action)))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  await page.screenshot({ path: info.outputPath(`margin-group-${failure}-${width}.png`), fullPage: true });
});
