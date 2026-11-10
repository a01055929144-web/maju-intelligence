import { expect, test } from "@playwright/test";
import { documentOutput, printPages, lineFromCatalog, type DocumentContent, type DocumentVersion } from "../../domains/pricing/document";

for (const width of [1440, 390]) for (const kind of ["sheet", "quote"] as const) test(`${kind} wrapped specs, pinned QR and archive at ${width}px`, async ({ page }, info) => {
  page.setDefaultTimeout(15_000);
  const company = "00000000-0000-4000-8000-000000000001", id = "10000000-0000-4000-8000-000000000001", versionId = "30000000-0000-4000-8000-000000000001", customerId = "40000000-0000-4000-8000-000000000001";
  const spec = "냉장·냉동 겸용 대용량 포장 1kg×12입 / 재포장 불가 (박스)";
  const product = { id: "20000000-0000-4000-8000-000000000001", name: "합성 긴 품목", displayName: "합성 긴 품목", brand: "", spec, unit: "박스", price: 123456, taxType: "exempt" as const };
  let archived = false, revision = 1, failArchive = true;
  const content: DocumentContent = { kind, title: "인쇄 검증 문서", companyName: "합성 유통", contact: "", recipient: "", footer: "합성 인쇄 안내", validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true, display: { columns: 3, promoLayout: "cards", info: [] }, lines: Array.from({ length: 24 }, (_, i) => lineFromCatalog({ ...product, id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` })) };
  const original = JSON.stringify(content);
  const draft = () => ({ id, revision, content, archivedAt: archived ? "2026-11-06T00:00:00Z" : null, updatedAt: "2026-11-06T00:00:00Z", recalculation: { publishedAt: "2026-11-06T00:00:00Z", needsRecalculation: false, changedProductCount: 0 } });
  await page.setViewportSize({ width, height: 1000 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.route("**/api/pricing-documents*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/catalog-index")) return route.fulfill({ json: { items: [product] } });
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : {};
    const action = body.action || url.searchParams.get("action") || "list";
    let result: unknown = [];
    if (action === "list") result = { items: (url.searchParams.get("archived") === "true") === archived ? [draft()] : [], total: (url.searchParams.get("archived") === "true") === archived ? 1 : 0 };
    if (action === "profile") result = { revision: 0, content: { companyName: "합성", contact: "", footer: "" } };
    if (action === "catalog") result = { items: [product], total: 1 };
    if (action === "versions") result = [{ id: versionId, documentId: id, version: 1, revision: 1, content, publishedAt: "2026-11-06T00:00:00Z", unavailablePromotions: [], promotionStock: {} }];
    if (action === "archive") {
      expect(body.id).toBe(id); expect(body.expected).toBe(revision);
      if (failArchive) { failArchive = false; return route.fulfill({ status: 409, json: { message: "합성 보관 실패. 다시 시도해 주세요." } }); }
      archived = body.archived; revision++; result = { id, revision, archivedAt: archived ? "2026-11-06" : null };
    }
    return route.fulfill({ json: { result, manager: true, archiveAvailable: true } });
  });
  await page.route("**/api/pricing-store-links*", async route => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({ companyId: company, action: "create", customerId, documentVersionId: versionId });
      return route.fulfill({ json: { url: "https://store.example.test/store#synthetic-signed-order-token" } });
    }
    return route.fulfill({ json: { items: [{ id: customerId, customer_name: "합성 매장", address: "합성 주소" }], nextCursor: null } });
  });
  await page.goto("/revenue/pricing/documents");
  await page.getByRole("button", { name: "인쇄 검증 문서", exact: true }).click();
  const paperSpec = page.locator(".pricing-edit-grid [data-document-spec]").first();
  await expect(paperSpec).toContainText(spec);
  expect(await paperSpec.evaluate(el => getComputedStyle(el).textOverflow)).not.toBe("ellipsis");
  expect(await paperSpec.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const priceFits = await page.getByRole("textbox", { name: "품목 1 단가", exact: true }).evaluate((element) => {
    const input = element as HTMLInputElement, style = getComputedStyle(input), context = document.createElement("canvas").getContext("2d")!;
    context.font = style.font;
    return context.measureText(input.value).width <= input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) + 1;
  });
  expect(priceFits).toBe(true);
  await page.getByRole("button", { name: /버전 1 미리보기/ }).click();
  const dialog = page.getByRole("dialog", { name: "미리보기", exact: true });
  await dialog.getByRole("button", { name: "130%", exact: true }).click();
  await dialog.getByRole("button", { name: "주문 링크 QR 만들기", exact: true }).click();
  await dialog.getByRole("button", { name: "기존 거래처 전용 QR 선택", exact: true }).click();
  await dialog.getByRole("combobox", { name: "QR을 받을 거래처", exact: true }).selectOption(customerId);
  await dialog.getByRole("button", { name: "선택 거래처 QR 생성", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "합성 매장 주문 QR 미리보기", exact: true })).toHaveAttribute("src", /^data:image\/png;base64,/);
  await dialog.getByRole("button", { name: "문서에 QR 넣기", exact: true }).click();
  await expect(dialog.locator(".pricing-paper").first().getByRole("img", { name: "합성 매장 주문 링크 QR", exact: true })).toBeVisible();
  expect(await dialog.locator(".pricing-paper [data-document-price-value]").first().evaluate(element => element.getClientRects().length)).toBe(1);
  const specBox = await dialog.locator(".pricing-paper [data-document-spec]").first().boundingBox(), priceBox = await dialog.locator(".pricing-paper [data-document-price]").first().boundingBox();
  expect(specBox!.x + specBox!.width).toBeLessThanOrEqual(priceBox!.x + 1);
  const metrics = await dialog.locator(".pricing-paper").evaluateAll(papers => papers.map(paper => {
    const style = getComputedStyle(paper), content = paper.querySelector(".pricing-output-content")!;
    return { available: paper.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom), actual: content.getBoundingClientRect().height };
  }));
  for (const metric of metrics) expect(metric.actual).toBeLessThanOrEqual(metric.available + 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 3)).toBe(false);
  const download = page.waitForEvent("download"); await dialog.getByRole("button", { name: "QR PNG 저장", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("order-qr-v1.png");
  await page.screenshot({ path: info.outputPath(`${kind}-wrapped-qr-${width}.png`), fullPage: true });
  if (width === 1440) await page.pdf({ path: info.outputPath(`${kind}-wrapped-qr-a4.pdf`), format: "A4", printBackground: true });
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "← 문서 목록", exact: true }).click();
  await page.getByRole("checkbox", { name: "인쇄 검증 문서 선택", exact: true }).check();
  page.on("dialog", dialog => dialog.accept());
  const archive = page.getByRole("button", { name: "선택 문서 보관", exact: true });
  if (width === 390) expect((await archive.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await archive.click(); await expect(page.getByRole("alert").filter({ hasText: "합성 보관 실패" })).toContainText("합성 보관 실패");
  await archive.click(); await expect(page.getByRole("status").filter({ hasText: "보관했습니다" })).toBeVisible();
  await page.getByRole("button", { name: "문서 보관함", exact: true }).click();
  await page.getByRole("checkbox", { name: "인쇄 검증 문서 선택", exact: true }).check();
  await page.getByRole("button", { name: "선택 문서 복원", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "복원했습니다" })).toBeVisible();
  expect(archived).toBe(false); expect(JSON.stringify(content)).toBe(original);
});


for(const columns of [1,2,3] as const)test(`CX-05 A4 density and fixed QR ${columns} columns`,async({page},info)=>{
  page.setDefaultTimeout(15_000);await page.setViewportSize({width:1600,height:1200});
  const id="10000000-0000-4000-8000-000000000001",versionId="30000000-0000-4000-8000-000000000001",customerId="40000000-0000-4000-8000-000000000001";
  const product={id:"20000000-0000-4000-8000-000000000001",name:"합성 품목",brand:"",spec:"1.8L × 12입",unit:"BOX",price:123456,taxType:"exempt" as const};
  const content:DocumentContent={kind:"sheet",title:`A4 ${columns}열 비교`,companyName:"합성 유통",contact:"",recipient:"",footer:"합성 인쇄 검증 · 모든 규격과 단위 보존",validUntil:"2099-12-31",theme:"blue",layout:"table",showPrice:true,showBrand:true,showSpec:true,
    display:{columns,promoLayout:"table",info:[],productWidth:65,priceIncludesTax:false},
    lines:Array.from({length:96},(_,i)=>lineFromCatalog({...product,id:`20000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`,displayName:`합성 품목 ${String(i+1).padStart(3,"0")}`}))};
  const version:DocumentVersion={id:versionId,documentId:id,version:1,revision:1,publishedAt:"2026-11-10T00:00:00Z",content,unavailablePromotions:[],promotionStock:{}};
  const output=documentOutput(version,"2026-11-10");
  expect((await page.request.post("/api/customer/login",{data:{email:"ci-owner@example.test",password:"ci-owner-layout-password-2026"}})).ok()).toBe(true);
  await page.route("**/api/pricing-documents*",route=>{
    const url=new URL(route.request().url()),body=route.request().method()==="POST"?route.request().postDataJSON():{};
    if(url.pathname.endsWith("/catalog-index"))return route.fulfill({json:{items:[product]}});
    const action=body.action||url.searchParams.get("action")||"list";
    const draft={id,revision:1,content,updatedAt:version.publishedAt,recalculation:{publishedAt:version.publishedAt,needsRecalculation:false,changedProductCount:0}};
    let result:unknown=[];
    if(action==="list")result={items:[draft],total:1};if(action==="versions")result=[version];
    if(action==="profile")result={revision:0,content:{companyName:"합성 유통",contact:"",footer:""}};
    if(action==="catalog")result={items:[product],total:1};
    return route.fulfill({json:{result,manager:true}});
  });
  await page.route("**/api/pricing-store-links*",route=>route.fulfill({json:route.request().method()==="POST"?{url:"https://store.example.test/store#synthetic-order-token"}:{items:[{id:customerId,customer_name:"합성 매장",address:"합성 주소"}],nextCursor:null}}));
  await page.goto("/revenue/pricing/documents");await page.getByRole("button",{name:content.title,exact:true}).click();
  await page.getByRole("button",{name:/버전 1 미리보기/}).click();const dialog=page.getByRole("dialog",{name:"미리보기",exact:true});
  const comparison:Array<{columns:number;font:number;qr:boolean;before:number;after:number;pages:number}>=[];
  for(const qr of [false,true]){
    if(qr){
      await dialog.getByRole("button",{name:"주문 링크 QR 만들기",exact:true}).click();await dialog.getByRole("button",{name:"기존 거래처 전용 QR 선택",exact:true}).click();
      await dialog.getByRole("combobox",{name:"QR을 받을 거래처",exact:true}).selectOption(customerId);await dialog.getByRole("button",{name:"선택 거래처 QR 생성",exact:true}).click();await dialog.getByRole("button",{name:"문서에 QR 넣기",exact:true}).click();
    }
    for(const scale of [1,1.15,1.3]){
      await dialog.getByRole("button",{name:`${Math.round(scale*100)}%`,exact:true}).click();
      const pages=printPages(output,scale,qr),before=Math.min(18*columns,Math.floor((Math.floor(26*columns/scale)-(qr?5*columns:0))/3));
      expect(pages.flatMap(p=>p.lines)).toEqual(output.lines);expect(pages[0].lines.length).toBeGreaterThan(before);
      comparison.push({columns,font:Math.round(scale*100),qr,before,after:pages[0].lines.length,pages:pages.length});
      await expect(dialog.locator(".pricing-paper")).toHaveCount(pages.length);
      const metrics=await dialog.locator(".pricing-paper").evaluateAll(papers=>papers.map(paper=>{
        const style=getComputedStyle(paper),content=paper.querySelector(".pricing-output-content")!,image=paper.querySelector("footer img");
        return {padding:parseFloat(style.paddingTop),available:paper.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom),actual:content.getBoundingClientRect().height,
          qrBottom:image?paper.getBoundingClientRect().bottom-image.getBoundingClientRect().bottom:null,
          clipped:Array.from(paper.querySelectorAll("[data-document-spec]")).some(element=>element.scrollWidth>element.clientWidth+1)};
      }));
      for(const metric of metrics){expect(metric.padding).toBeCloseTo(10*96/25.4,0);expect(metric.actual).toBeLessThanOrEqual(metric.available+2);expect(metric.clipped).toBe(false);}
      if(qr){const positions=metrics.map(m=>m.qrBottom!);expect(Math.max(...positions)-Math.min(...positions)).toBeLessThan(2);}
      const download=page.waitForEvent("download");await dialog.getByRole("button",{name:"1쪽 PNG 저장",exact:true}).click();
      await(await download).saveAs(info.outputPath(`CX-05-${columns}col-${Math.round(scale*100)}${qr?"-qr":""}.png`));
    }
  }
  console.log("CX-05_CAPACITY",JSON.stringify(comparison));
  await info.attach(`CX-05-${columns}col-capacity.json`,{body:JSON.stringify(comparison,null,2),contentType:"application/json"});
});
