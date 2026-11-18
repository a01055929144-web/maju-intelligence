import { expect, test } from "@playwright/test";
import { documentOutput, printPages, lineFromCatalog, type DocumentContent, type DocumentVersion } from "../../domains/pricing/document";
import { documentRequestError } from "../../lib/pricing/document-request-error";

for (const width of [1440, 390]) test(`draft save failures preserve revision19 and edits at ${width}px`, async ({ page }) => {
  page.setDefaultTimeout(15_000);
  const id = "10000000-0000-4000-8000-000000000001";
  const product = { id: "20000000-0000-4000-8000-000000000001", name: "합성 계란", displayName: "합성 계란", brand: "", spec: "30개", unit: "판", price: 1000, taxType: "exempt" as const };
  let revision = 19, attempts = 0;
  let content: DocumentContent = { kind: "sheet", title: "저장 오류 합성 문서", companyName: "합성 회사", contact: "", recipient: "", footer: "", validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true,
    lines: [lineFromCatalog(product), ...[1, 2, 3].map(n => ({ ...lineFromCatalog(product), promotionId: `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`, badge: "행사", startsOn: "2020-01-01", endsOn: "2099-12-31" }))] };
  const failures = [
    ["Promotion not found", "P0001"], ["Promotion not enabled for sheets", "P0001"], ["Stale document", "P0001"], ["undefined column", "42703"],
  ].map(([message, code]) => documentRequestError(new Error(`Supabase request failed: 400 ${JSON.stringify({ message, code, details: "PRIVATE_SYNTHETIC_DETAIL" })}`), true));
  const requests: unknown[] = [];
  const draft = () => ({ id, revision, content, updatedAt: "2026-11-18T00:00:00Z", recalculation: { publishedAt: null, needsRecalculation: false, changedProductCount: 0 } });
  await page.setViewportSize({ width, height: 1000 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.route("**/api/pricing-documents*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/catalog-index")) return route.fulfill({ json: { items: [product] } });
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : {};
    const action = body.action || url.searchParams.get("action") || "list";
    let result: unknown = [];
    if (action === "list") result = { items: [draft()], total: 1 };
    if (action === "profile") result = { revision: 0, content: { companyName: "합성 회사", contact: "", footer: "" } };
    if (action === "catalog") result = { items: [product], total: 1 };
    if (action === "save") {
      expect(body.id).toBe(id); expect(body.expected).toBe(19); expect(body.content.title).toBe("수정한 제목 보존");
      expect(body.content.lines).toEqual(content.lines); requests.push(body);
      const failure = failures[attempts++];
      if (failure) { const { status, ...json } = failure; return route.fulfill({ status, json }); }
      content = body.content; revision = 20; result = draft();
    }
    return route.fulfill({ json: { result, manager: true } });
  });
  await page.goto("/revenue/pricing/documents");
  await page.getByRole("button", { name: "저장 오류 합성 문서", exact: true }).click();
  const title = page.getByRole("textbox", { name: "문서 제목", exact: true }).first();
  await title.fill("수정한 제목 보존");
  async function save() {
    if (width === 390) { await page.getByRole("button", { name: "더보기", exact: true }).click(); await page.getByRole("menuitem", { name: "초안 저장", exact: true }).click(); }
    else await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  }
  for (const failure of failures) {
    await save();
    await expect(page.getByRole("alert").filter({ hasText: failure.message })).toBeVisible();
    await expect(title).toHaveValue("수정한 제목 보존");
    await expect(page.getByRole("button", { name: "판매가 버전 확정", exact: true })).toBeDisabled();
    expect(revision).toBe(19);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 3)).toBe(true);
    await expect(page.getByRole("alert").filter({ hasText: failure.message })).not.toContainText("PRIVATE_");
  }
  await page.screenshot({ path: `test-results/readonly-pg17/document-save-errors/save-error-${width}.png`, fullPage: true });
  await save();
  await expect(page.getByRole("status").filter({ hasText: "초안을 저장했습니다." })).toBeVisible();
  await expect(title).toHaveValue("수정한 제목 보존");
  expect(revision).toBe(20); expect(requests).toHaveLength(5);
  expect(new Set(requests.map(request => JSON.stringify(request))).size).toBe(1);
});

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
  await expect(dialog.locator(".pricing-online .pricing-output-grid table")).toHaveCount(1);
  expect(await dialog.locator(".pricing-online [data-document-spec]").evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1))).toBe(true);
  expect(await dialog.locator(".pricing-online [data-document-price]").evaluateAll(els=>els.every(el=>getComputedStyle(el).whiteSpace==="nowrap"))).toBe(true);

  await dialog.getByRole("button", { name: "주문 링크 QR 만들기", exact: true }).click();
  await dialog.getByText("관리 · 회수와 기존 거래처 전용 QR", { exact: true }).click();
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
  const archive = page.getByRole("button", { name: "선택 문서 보관", exact: true });
  if (width === 390) expect((await archive.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await archive.click();
  const archiveDialog = page.getByRole("dialog", { name: "선택 문서 보관", exact: true });
  await expect(archiveDialog).toContainText("발행본·공유 링크·주문 내역은 유지");
  await archiveDialog.getByRole("button", { name: "취소", exact: true }).click();
  expect(archived).toBe(false);
  await archive.click(); await archiveDialog.getByRole("button", { name: "보관", exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: "합성 보관 실패" })).toContainText("합성 보관 실패");
  await archive.click(); await archiveDialog.getByRole("button", { name: "보관", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "보관했습니다" })).toBeVisible();
  await page.getByRole("button", { name: "문서 보관함", exact: true }).click();
  await page.getByRole("checkbox", { name: "인쇄 검증 문서 선택", exact: true }).check();
  await page.getByRole("button", { name: "선택 문서 복원", exact: true }).click(); await page.getByRole("dialog", { name: "선택 문서 복원", exact: true }).getByRole("button", { name: "복원", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "복원했습니다" })).toBeVisible();
  expect(archived).toBe(false); expect(JSON.stringify(content)).toBe(original);
});


test.describe("CX-05 A4 comparison previews",()=>{
  test.use({deviceScaleFactor:2});
for(const count of [18,96]) for(const columns of [1,2,3] as const)test(`CX-05 A4 density and fixed QR ${columns} columns ${count} items`,async({page},info)=>{
  page.setDefaultTimeout(15_000);await page.setViewportSize({width:1600,height:2000});
  const id="10000000-0000-4000-8000-000000000001",versionId="30000000-0000-4000-8000-000000000001",customerId="40000000-0000-4000-8000-000000000001";
  const product={id:"20000000-0000-4000-8000-000000000001",name:"합성 품목",brand:"",spec:"1.8L × 12입",unit:"BOX",price:123456,taxType:"exempt" as const};
  const content:DocumentContent={kind:"sheet",title:`A4 ${columns}열 비교`,companyName:"합성 유통",contact:"",recipient:"",footer:"합성 인쇄 검증 · 모든 규격과 단위 보존",validUntil:"2099-12-31",theme:"blue",layout:"table",showPrice:true,showBrand:true,showSpec:true,
    display:{columns,promoLayout:"table",info:[],productWidth:65,priceIncludesTax:false},
    lines:Array.from({length:count},(_,i)=>lineFromCatalog({...product,id:`20000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`,displayName:`합성 품목 ${String(i+1).padStart(3,"0")}`}))};
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
  const comparison:unknown[]=[];
  for(const qr of [false,true]){
    if(qr){
      await dialog.getByRole("button",{name:"주문 링크 QR 만들기",exact:true}).click();await dialog.getByText("관리 · 회수와 기존 거래처 전용 QR",{exact:true}).click();await dialog.getByRole("button",{name:"기존 거래처 전용 QR 선택",exact:true}).click();
      await dialog.getByRole("combobox",{name:"QR을 받을 거래처",exact:true}).selectOption(customerId);await dialog.getByRole("button",{name:"선택 거래처 QR 생성",exact:true}).click();await dialog.getByRole("button",{name:"문서에 QR 넣기",exact:true}).click();
    }
    for(const scale of [1,1.15,1.3]){
      await dialog.getByRole("button",{name:`${Math.round(scale*100)}%`,exact:true}).click();
      await page.evaluate(()=>document.fonts.ready);
      const pages=printPages(output,scale,qr),before=Math.min(18*columns,Math.floor((Math.floor(26*columns/scale)-(qr?5*columns:0))/3));
      expect(pages.flatMap(p=>p.lines)).toEqual(output.lines);expect(pages[0].lines.length).toBeGreaterThanOrEqual(Math.min(count,before));
      if(count===18 && columns===2 && scale===1 && !qr) expect(pages).toHaveLength(1);

      await expect(dialog.locator(".pricing-paper")).toHaveCount(pages.length);
      const metrics=await dialog.locator(".pricing-paper").evaluateAll(papers=>papers.map(paper=>{
        const style=getComputedStyle(paper),content=paper.querySelector(".pricing-output-content")!,image=paper.querySelector("footer img");
        return {padding:parseFloat(style.paddingTop),available:paper.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom),actual:content.getBoundingClientRect().height,
          qrBottom:image?paper.getBoundingClientRect().bottom-image.getBoundingClientRect().bottom:null,
          clipped:Array.from(paper.querySelectorAll("[data-document-spec]")).some(element=>element.scrollWidth>element.clientWidth+1)};
      }));
      for(const metric of metrics){expect(metric.padding).toBeCloseTo(10*96/25.4,0);expect(metric.actual).toBeLessThanOrEqual(metric.available+2);expect(metric.clipped).toBe(false);}
      if(qr){const positions=metrics.map(m=>m.qrBottom!);expect(Math.max(...positions)-Math.min(...positions)).toBeLessThan(2);}
      // Intrinsic occupied height excludes the footer's auto margin and the 277mm flex minimum.
      // Reconstruct the former first page from these same rendered rows and its former CSS.
      const fill=await dialog.locator(".pricing-paper").first().evaluate((paper,{before,columns,scale})=>{
        const occupied=(content:Element)=>{
          const style=getComputedStyle(content);
          return Array.from(content.children).reduce((sum,child)=>{
            const s=getComputedStyle(child);
            return sum+child.getBoundingClientRect().height+(child.classList.contains("mt-auto")?0:parseFloat(s.marginTop)||0)+(parseFloat(s.marginBottom)||0);
          },parseFloat(style.borderTopWidth)||0);
        };
        const content=paper.querySelector(".pricing-output-content")!;
        const after=occupied(content)/(277*96/25.4);
        const clone=paper.cloneNode(true) as HTMLElement;
        clone.style.cssText="position:fixed;left:-10000px;top:0;padding:14mm;width:210mm;height:297mm";
        const style=document.createElement("style");
        style.textContent=`.cx05-before table{font-size:${Math.round(11*scale)}px;line-height:${Math.round(16*scale)}px}.cx05-before table .text-xs{font-size:12px;line-height:16px}.cx05-before .pricing-output-table td,.cx05-before .pricing-output-table th{padding:6px}.cx05-before .pricing-output-grid{gap:12px;margin-top:12px;margin-bottom:12px}`;
        clone.classList.add("cx05-before");clone.append(style);document.body.append(clone);
        const tables=Array.from(clone.querySelectorAll(".pricing-output-grid table"));
        const rows=tables.flatMap(t=>Array.from(t.querySelectorAll("tbody tr")));
        for(const t of tables)t.querySelector("tbody")!.replaceChildren();
        const n=Math.ceil(Math.min(rows.length,before)/columns);
        rows.slice(0,before).forEach((row,i)=>tables[Math.floor(i/n)].querySelector("tbody")!.append(row));
        const old=occupied(clone.querySelector(".pricing-output-content")!)/(269*96/25.4);
        clone.remove();return {beforeFillPercent:Math.round(old*1000)/10,afterFillPercent:Math.round(after*1000)/10};
      },{before,columns,scale});
      comparison.push({count,columns,font:Math.round(scale*100),qr,before:Math.min(count,before),after:pages[0].lines.length,pages:pages.length,...fill});

      await dialog.locator(".pricing-paper").first().screenshot({path:info.outputPath(`CX-05-${count}items-${columns}col-${Math.round(scale*100)}${qr?"-qr":""}.png`),animations:"disabled"});
    }
  }
  if(count===18){
    await page.setViewportSize({width:390,height:1000});
    const online=dialog.locator(".pricing-online");
    await expect(online.locator(".pricing-output-grid table")).toHaveCount(1);
    expect(await online.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    expect(await online.locator("[data-document-price]").evaluateAll(els=>els.every(el=>getComputedStyle(el).whiteSpace==="nowrap"&&getComputedStyle(el).textAlign==="right"))).toBe(true);
    // The modal owns its scrolling/sticky header; document table headings must not float over it.
    await dialog.evaluate(el=>{el.scrollTop=600;});
    const header=dialog.locator(":scope > div").first();
    expect(Math.abs((await header.boundingBox())!.y)).toBeLessThan(2);
    expect(await header.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+10,r.top+10));})).toBe(true);
    await page.screenshot({path:info.outputPath(`CX-05-phone-header-${columns}col-source.png`)});
    await dialog.evaluate(el=>{el.scrollTop=0;});
    await online.evaluate(el=>{
      const modal=el.closest("[role=dialog]")!;
      modal.scrollTop+=el.getBoundingClientRect().top-modal.firstElementChild!.getBoundingClientRect().bottom-8;
    });
    await page.screenshot({path:info.outputPath(`CX-05-phone-${columns}col-source.png`)});
    await dialog.getByRole("button",{name:"닫기",exact:true}).click();
    content.layout="cards";
    await page.reload();
    await page.getByRole("button",{name:content.title,exact:true}).click();
    await page.getByRole("button",{name:/버전 1 미리보기/}).click();
    const cards=page.getByRole("dialog",{name:"미리보기",exact:true}).locator(".pricing-online");
    expect(await cards.locator("article").evaluateAll(els=>els.length===18&&els.every(el=>Math.abs(el.getBoundingClientRect().left-els[0].getBoundingClientRect().left)<1))).toBe(true);
    expect(await cards.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    await cards.evaluate(el=>{
      const modal=el.closest("[role=dialog]")!;
      modal.scrollTop+=el.getBoundingClientRect().top-modal.firstElementChild!.getBoundingClientRect().bottom-8;
    });
    await page.screenshot({path:info.outputPath(`CX-05-phone-cards-${columns}col-source.png`)});
  }
  console.log("CX-05_CAPACITY",JSON.stringify(comparison));
  await info.attach(`CX-05-${count}items-${columns}col-capacity.json`,{body:JSON.stringify(comparison,null,2),contentType:"application/json"});
});

});

for (const width of [1440, 390]) test(`promotion tax: inherit, explicitly correct legacy mismatch, reject unknown at ${width}px`, async ({ page }) => {
  page.setDefaultTimeout(15_000);
  const product = { id: "20000000-0000-4000-8000-000000000001", name: "합성 면세 계란", displayName: "합성 면세 계란", brand: "", spec: "30개", unit: "판", price: 1100, cost: 1000, taxType: "exempt" };
  let currentTax = "exempt";
  const writes: Array<{ expected: number; content: { taxType: string; cost: number; margin: number } }> = [];
  let promotions: Array<Record<string, unknown>> = [];
  await page.setViewportSize({ width, height: 1000 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.route("**/api/price-sheets/folder-order*", route => route.fulfill({ json: { folders: [] } }));
  await page.route("**/api/pricing-documents*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/catalog-index")) return route.fulfill({ json: { items: [{ ...product, code: "SYN-EGG" }] } });
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : {};
    const action = body.action || url.searchParams.get("action") || "list";
    let result: unknown = [];
    if (action === "catalog") result = { items: [{ ...product, taxType: currentTax }], total: 1 };
    if (action === "promotions") result = promotions;
    if (action === "save-promotion") {
      writes.push(body);
      result = { revision: body.expected + 1 };
      // Synthetic legacy mismatch fixture after first creation; never auto-correct it.
      promotions = [{ ...body.content, id: body.id, revision: 4, price: 1100, taxType: writes.length === 1 ? "taxable" : body.content.taxType }];
    }
    return route.fulfill({ json: { result, manager: true } });
  });
  await page.goto(`/revenue/pricing/promotions?new=행사&productId=${product.id}`);
  const create = page.getByRole("dialog", { name: "행사 등록", exact: true });
  await expect(create.getByRole("combobox", { name: "행사 과세·면세", exact: true })).toHaveValue("exempt");
  await create.getByRole("spinbutton", { name: "행사 매입가", exact: true }).fill("1000");
  await create.getByRole("spinbutton", { name: "마진(%)", exact: true }).fill("10");
  await create.getByLabel("종료일", { exact: true }).fill("2099-12-31");
  await create.getByRole("button", { name: "저장", exact: true }).click();
  await expect(create).not.toBeVisible();
  expect(writes[0].expected).toBe(0); expect(writes[0].content.taxType).toBe("exempt");
  await page.getByRole("button", { name: "수정", exact: true }).first().click();
  const edit = page.getByRole("dialog", { name: "행사 수정", exact: true });
  await expect(edit.getByRole("combobox", { name: "행사 과세·면세", exact: true })).toHaveValue("taxable");
  const apply = edit.getByRole("button", { name: "원상품 세금 구분 반영", exact: true });
  await expect(apply).toBeVisible(); expect(writes).toHaveLength(1);
  expect((await apply.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 3)).toBe(true);
  await page.screenshot({ path: `test-results/readonly-pg17/promotion-tax-source/mismatch-${width}.png`, fullPage: true });
  await apply.click(); expect(writes).toHaveLength(1);
  await edit.getByRole("button", { name: "저장", exact: true }).click();
  await expect(edit).not.toBeVisible();
  expect(writes[1]).toMatchObject({ expected: 4, content: { taxType: "exempt", cost: 1000, margin: 10 } });
  currentTax = "unknown";
  await page.goto(`/revenue/pricing/promotions?new=행사&productId=${product.id}`);
  await expect(create.getByRole("combobox", { name: "행사 과세·면세", exact: true })).toHaveValue("unknown");
  await expect(create.getByRole("button", { name: "저장", exact: true })).toBeDisabled();
  await expect(create).toContainText("상품관리에서 과세·면세를 확인");
  expect(writes).toHaveLength(2);
});

for (const width of [1440, 390]) test(`draft tax refresh is explicit and preserves published taxes at ${width}px`, async ({ page }) => {
  page.setDefaultTimeout(15_000);
  const id = "10000000-0000-4000-8000-000000000001", promotionId = "30000000-0000-4000-8000-000000000001";
  const product = { id: "20000000-0000-4000-8000-000000000001", name: "합성 계란", displayName: "합성 계란", brand: "", spec: "30개", unit: "판", price: 1000, taxType: "taxable" as const };
  let currentTax = "exempt", offerTax = "taxable", revision = 19;
  let content: DocumentContent = { kind: "sheet", title: "세금 갱신 합성 문서", companyName: "합성 회사", contact: "", recipient: "", footer: "", validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true, display: { columns: 1, promoLayout: "table", info: [], showTaxType: true },
    lines: [lineFromCatalog(product), { ...lineFromCatalog(product), promotionId, badge: "행사", startsOn: "2020-01-01", endsOn: "2099-12-31" }] };
  const published = structuredClone(content);
  const writes: unknown[] = [];
  const draft = () => ({ id, revision, content, updatedAt: "2026-11-18T00:00:00Z", recalculation: { publishedAt: "2026-11-17T00:00:00Z", needsRecalculation: false, changedProductCount: 0 } });
  const offer = () => ({ id: promotionId, productId: product.id, name: product.name, displayName: product.displayName, startsOn: "2020-01-01", endsOn: "2099-12-31", price: 1000, stock: null, perStoreLimit: null, allowSheet: true, badge: "행사", revision: 1, taxType: offerTax });
  await page.setViewportSize({ width, height: 1000 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.route("**/api/pricing-documents*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/catalog-index")) return route.fulfill({ json: { items: [product] } });
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : {};
    const action = body.action || url.searchParams.get("action") || "list";
    let result: unknown = [];
    if (action === "list") result = { items: [draft()], total: 1 };
    if (action === "profile") result = { revision: 0, content: { companyName: "합성 회사", contact: "", footer: "" } };
    if (action === "catalog") { expect((url.searchParams.get("productIds") || "").split(",").length).toBeLessThanOrEqual(100); result = { items: [{ ...product, taxType: currentTax }], total: 1 }; }
    if (action === "promotions") result = [offer()];
    if (action === "versions") result = [{ id: "40000000-0000-4000-8000-000000000001", documentId: id, version: 1, revision: 1, content: published, publishedAt: "2026-11-17T00:00:00Z", unavailablePromotions: [], promotionStock: {} }];
    if (action === "save") {
      expect(body.expected).toBe(19); expect(body.content.lines.map((line: { price: number }) => line.price)).toEqual([1000, 1000]);
      expect(body.content.lines.map((line: { taxType: string }) => line.taxType)).toEqual(["exempt", "exempt"]);
      writes.push(body); content = body.content; revision++; result = draft();
    }
    return route.fulfill({ json: { result, manager: true } });
  });
  await page.goto("/revenue/pricing/documents");
  await page.getByRole("button", { name: "세금 갱신 합성 문서", exact: true }).click();
  if (width === 390) { await page.getByRole("button", { name: "더보기", exact: true }).click(); await page.getByRole("menuitem", { name: "표로 보기", exact: true }).click(); }
  else await page.getByRole("tab", { name: "표", exact: true }).click();
  const normal = page.getByRole("combobox", { name: "품목 1 과세", exact: true }), promo = page.getByRole("combobox", { name: "품목 2 과세", exact: true });
  await expect(normal).toHaveValue("taxable"); await expect(promo).toBeDisabled();
  expect((await page.getByRole("button", { name: "행사 세금 수정", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  async function refresh() { await page.getByRole("button", { name: "더보기", exact: true }).click(); await page.getByRole("menuitem", { name: "현재 세금 구분 반영", exact: true }).click(); }
  await refresh();
  await expect(page.getByRole("alert").filter({ hasText: "행사 원본과 상품" })).toBeVisible();
  await expect(normal).toHaveValue("taxable"); expect(writes).toHaveLength(0);
  offerTax = "exempt";
  await refresh();
  const dialog = page.getByRole("dialog", { name: "현재 세금 구분 반영", exact: true });
  await expect(dialog).toContainText("면세로 2개"); await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(normal).toHaveValue("taxable"); expect(writes).toHaveLength(0);
  await refresh(); await dialog.getByRole("button", { name: "초안에 반영", exact: true }).click();
  await expect(normal).toHaveValue("exempt"); await expect(promo).toHaveValue("exempt"); expect(writes).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 3)).toBe(true);
  await page.screenshot({ path: `test-results/readonly-pg17/document-tax-refresh/reviewed-${width}.png`, fullPage: true });
  if (width === 390) { await page.getByRole("button", { name: "더보기", exact: true }).click(); await page.getByRole("menuitem", { name: "초안 저장", exact: true }).click(); }
  else await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "초안을 저장했습니다." })).toBeVisible();
  expect(writes).toHaveLength(1);
  await page.getByRole("button", { name: /버전 1 미리보기/ }).click();
  const preview = page.getByRole("dialog", { name: "미리보기", exact: true });
  await expect(preview).toContainText("과세");
  expect(published.lines.map(line => line.taxType)).toEqual(["taxable", "taxable"]);
  await preview.getByRole("button", { name: "닫기", exact: true }).click();
  currentTax = "unknown";
  await refresh(); await expect(page.getByRole("alert").filter({ hasText: "현재 상품의 과세·면세" })).toBeVisible();
  await expect(normal).toHaveValue("exempt"); expect(writes).toHaveLength(1);
});
