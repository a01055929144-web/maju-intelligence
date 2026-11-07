import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import { buildCatalogPreview } from '../../domains/product/catalog-import';

const company = '00000000-0000-4000-8000-000000000001';
const date = process.env.STAGE_A_TEST_DATE || new Date().toISOString().slice(0,10);
const priorDate = new Date(Date.parse(date+'T00:00:00Z')-172800000).toISOString().slice(0,10);
const units = ['EA','BOX','봉','병'];
type Product = { code: string; id: string; cost: string; date: string | null; purchase_unit: string; sales_unit: string | null; price: string };
type State = { products_count: number; unpriced: number; receipts: number; batches: number; price_runs: number; corrections: number; other_cost: string;
  batch: null | { id: string; status: string; row_count: number; history_only_product_count: number; recalc_run_id: string | null }; items: Product[] };
function db(action: string, value?: number, input?: unknown) {
  return execFileSync(process.execPath, ['scripts/stage-a-test-db.mjs', action, ...(value === undefined ? [] : [String(value)])], {
    encoding: 'utf8', timeout: 60_000, maxBuffer: 8_000_000, input: input === undefined ? undefined : JSON.stringify(input)
  }).trim();
}
const state = () => JSON.parse(db('state')) as State;
const code = (i: number) => `ERP-${String(i+1).padStart(4,'0')}`;
const name = (i: number, existing: number) => i < existing ? `합성 기존 품목 ${i+1}` : `검증 신규 제트 ${i+1}`;
const chosenCost = (i: number, existing: number) => i >= existing ? 90 : [150,80,100][i%3];
function syntheticFile(existing: number) {
  const header = ['ERP 코드','품목','규격','단위','구매일','단가','수량','공급가액','부가세','합계','매입처'];
  const rows = Array.from({length:3417},(_,index)=>{
    const i=index%745, occurrence=Math.floor(index/745), quantity=index%3+1;
    const cost=chosenCost(i,existing)+(i<188 && occurrence>0 ? 20 : 0);
    return [code(i),name(i,existing),'1kg',index<1552?'':units[i%4],date,cost,quantity,cost*quantity,cost*quantity/10,cost*quantity*11/10,'합성 매입처'];
  });
  const workbook=XLSX.utils.book_new();
  const sheet=XLSX.utils.aoa_to_sheet([header,...rows]);
  rows.forEach((_,index)=> { sheet[XLSX.utils.encode_cell({r:index+1,c:4})]={t:'d',v:new Date(date+'T00:00:00Z'),z:'yyyy-mm-dd'}; });
  XLSX.utils.book_append_sheet(workbook,sheet,'합성 매입');
  return { rows, buffer: XLSX.write(workbook,{type:'buffer',bookType:'xlsx',cellDates:true}) as Buffer };
}

// These are real Next APIs -> prefix gateway -> PostgREST -> disposable PG17.
// No core endpoint is fulfilled with a mock response.
for (const scenario of [{width:1280,existing:741,held:0},{width:390,existing:741,held:10},{width:390,existing:0,held:10}]) {
  test(`Stage A real API PG17 rows=3417 conflicts=188 emptyUnits=1552 width=${scenario.width} existing=${scenario.existing}`, async ({page,request},info)=>{
    db('seed',scenario.existing);
    await page.setViewportSize({width:scenario.width,height:900});
    await page.route('**/*',route=>new URL(route.request().url()).host==='127.0.0.1:3101'?route.continue():route.abort());
    expect((await request.get(`/api/price-sheets/costs/date-batches?companyId=${company}`)).status()).toBe(401);
    const login=await page.request.post('/api/customer/login',{data:{email:'ci-owner@example.test',password:process.env.STAGE_A_OWNER_PASSWORD!}});
    expect(login.status()).toBe(200);
    const owner=(await page.context().cookies()).find(cookie=>cookie.name==='maju_customer_session')!;
    expect(owner).toBeTruthy();
    const decoded=JSON.parse(Buffer.from(owner.value.split('.')[0],'base64url').toString('utf8'));
    const member=Buffer.from(JSON.stringify({...decoded,role:'member',workspaceRole:'member'})).toString('base64url');
    const signature=createHash('sha256').update(`${member}.${process.env.STAGE_A_SESSION_SECRET}`).digest('hex');
    await page.context().addCookies([{...owner,value:`${member}.${signature}`}]);
    expect((await page.request.get(`/api/price-sheets/costs/date-batches?companyId=${company}`)).status()).toBe(403);
    await page.context().addCookies([owner]);
    const bad=await page.request.post('/api/price-sheets/costs/date-batches',{data:{action:'save',companyId:company,batchId:randomUUID(),receiptDate:date,fileName:'scope-check.xlsx',rows:[{
      productId:'20000000-0000-4000-8000-000000999999',priceDate:date,cost:1,selectedSourceRowNumber:2,priceSelected:true,priceHeld:false,
      lineKey:'scope-probe',productName:'Scope probe',spec:'',unit:'EA',supplierName:'',erpCode:'',unitPrice:1,priceIncludesVat:false,rawValues:['synthetic']
    }]}});
    expect(bad.status()).toBe(409); expect(state().batches).toBe(0); expect(Number(state().other_cost)).toBe(999);
    expect((await page.request.post('/api/price-sheets/costs',{data:{companyId:company,changes:[]}})).status()).toBe(409);
    expect((await page.request.post(`/api/price-sheets?companyId=${company}`,{data:{action:'defaults',margin:20,rounding:10}})).status()).toBe(200);
    expect((await page.request.post(`/api/price-sheets?companyId=${company}`,{data:{action:'recalculate'}})).status()).toBe(200);
    const initial=state();
    const writes: Array<{id:string;action:string;digest:string;rows:number}>=[];
    let standalonePricingWrites=0;
    page.on('request',req=>{
      if(req.method()!=='POST')return;
      const path=new URL(req.url()).pathname;
      if(path==='/api/price-sheets/costs/date-batches') {
        const body=req.postDataJSON(); writes.push({id:body.batchId,action:body.action,digest:createHash('sha256').update(req.postData()!).digest('hex'),rows:body.rows?.length||0});
      }
      if(path==='/api/price-sheets')standalonePricingWrites++;
    });
    await page.goto(`/revenue/pricing?companyId=${company}`);
    await expect(page.getByRole('button',{name:'① 엑셀 올리기',exact:true})).toBeVisible();
    const file=syntheticFile(scenario.existing);
    await page.locator('input[type="file"]').setInputFiles({name:'stage-a-synthetic.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:file.buffer});
    const preview=page.getByRole('region',{name:'업로드 적용일과 단가 확인',exact:true});
    await expect(preview).toContainText('미선택 188그룹');
    const conflicts=page.getByRole('region',{name:'상이 단가 선택',exact:true});
    await conflicts.getByRole('combobox').first().selectOption('100');
    let chosen=0;
    while(chosen<188) {
      const options=conflicts.getByRole('combobox',{name:/적용 단가$/});
      await expect(options).toHaveCount(Math.min(100,188-chosen));
      const count=await options.count();
      for(let index=0;index<count;index++) {
        const value=chosen<scenario.held?'hold':await options.nth(index).locator('option').nth(2).getAttribute('value');
        await options.nth(index).selectOption(value!); chosen++;
      }
      if(chosen<188)await conflicts.getByRole('button',{name:'다음',exact:true}).click();
    }
    await expect(preview).toContainText('미선택 0그룹');
    await page.getByRole('button',{name:'② 열 정렬',exact:true}).click();
    await page.getByRole('button',{name:/③ 저장/}).click();
    const review=page.getByRole('region',{name:'저장 전 적용일 확인',exact:true});
    await expect(review).toContainText('원본 거래 3417행');
    await expect(review).toContainText('단위 미기재 1552행');
    await review.getByRole('checkbox',{name:'적용 날짜·건수와 단가 선택·보류 내용을 확인했습니다.',exact:true}).check();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath('real-stage-a-review.png'),fullPage:true});
    db('fail-on');
    await review.getByRole('button',{name:'확인한 날짜로 저장',exact:true}).click();
    await expect(page.getByRole('alert').filter({hasText:'날짜별 매입가 처리가 완료되지 않았습니다'})).toBeVisible();
    const failed=state();
    expect(failed.products_count).toBe(745); expect(failed.unpriced).toBe(745-scenario.existing);
    expect(failed.receipts).toBe(0); expect(failed.batches).toBe(0); expect(failed.price_runs).toBe(initial.price_runs);
    expect(Number(failed.other_cost)).toBe(999);
    expect(writes).toHaveLength(1);
    db('fail-off');
    await review.getByRole('checkbox',{name:'적용 날짜·건수와 단가 선택·보류 내용을 확인했습니다.',exact:true}).check();
    const started=Date.now();
    await review.getByRole('button',{name:'확인한 날짜로 저장',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:`현재가 반영 ${745-scenario.held}품목 · 이력 전용 ${scenario.held}품목`})).toBeVisible();
    expect(writes).toHaveLength(2); expect(writes[1]).toEqual(writes[0]);
    const saved=state();
    expect(saved.products_count).toBe(745); expect(saved.receipts).toBe(3417); expect(saved.batches).toBe(1);
    expect(saved.batch).toMatchObject({id:writes[0].id,status:'completed',row_count:3417,history_only_product_count:scenario.held});
    expect(saved.batch!.recalc_run_id).toBeTruthy();
    expect(JSON.parse(db('verify-source',undefined,file.rows))).toMatchObject({verifiedOriginalRows:3417,allRawValuesAndAmountsPreserved:true});
    for(let i=0;i<745;i++) {
      const product=saved.items.find(item=>item.code===code(i))!; expect(product).toBeTruthy();
      const held=i<scenario.held, cost=held?(i<scenario.existing?100:0):chosenCost(i,scenario.existing);
      expect(Number(product.cost)).toBe(cost); expect(Number(product.price)).toBe(Math.ceil(cost*1.2/10)*10);
      expect(product.date).toBe(held?(i<scenario.existing?priorDate:null):date);
      // A known source unit must survive standard-product creation and be visible after reload.
      expect(product.purchase_unit).toBe(units[i%4]);
      if(i>=scenario.existing)expect(product.sales_unit).toBe(units[i%4]);
    }
    const summary=await page.request.get(`/api/price-sheets/receipts?companyId=${company}&summary=1`);
    expect(summary.status()).toBe(200);
    const history=await summary.json();
    expect(history.summary).toHaveLength(745);
    expect(history.summary.reduce((sum:number,item:{count:number})=>sum+item.count,0)).toBe(3417);
    expect(standalonePricingWrites).toBe(0); expect(Number(saved.other_cost)).toBe(999);
    console.info(`stage-a real-api PG17 width=${scenario.width} existing=${scenario.existing} rows=3417 products=745 conflicts=188 emptyUnits=1552 savedMs=${Date.now()-started}`);
    await page.reload();
    const checkVisibleCosts = async (restored: boolean) => {
      await page.getByRole('navigation',{name:'매입가 보기',exact:true}).getByRole('button',{name:'전체',exact:true}).click();
      for (const i of [0,12,13,14,744]) {
        const label=name(i,scenario.existing);
        await page.getByRole('textbox',{name:'품목 검색',exact:true}).fill(label);
        const row=page.getByRole('textbox',{name:`${label} 품목명`,exact:true}).locator('xpath=ancestor::tr[1]');
        const cost=restored?(i<scenario.existing?100:0):(i<scenario.held?(i<scenario.existing?100:0):chosenCost(i,scenario.existing));
        await expect(row.getByRole('cell',{name:`${cost}원`,exact:true}).first()).toBeVisible();
      }
      await page.getByRole('textbox',{name:'품목 검색',exact:true}).fill('');
    };
    await checkVisibleCosts(false);
    await page.screenshot({path:info.outputPath('real-stage-a-saved.png')});
    await expect(page.getByRole('button',{name:'직전 날짜별 매입가·판매가 함께 되돌리기',exact:true})).toBeEnabled();
    await page.getByRole('button',{name:'매입 이력',exact:true}).click();
    const panel=page.getByRole('heading',{name:'매입 이력',exact:true}).locator('xpath=ancestor::section[1]');
    await expect(panel.getByRole('button',{name:name(0,scenario.existing),exact:true})).toBeVisible();
    await panel.getByRole('button',{name:name(0,scenario.existing),exact:true}).click();
    const correction=panel.getByRole('button',{name:new RegExp(`${date}.*매입 기록 정정`)}).first();
    await correction.click();
    await page.getByLabel('정정 단가',{exact:true}).fill('99');
    await page.getByLabel('정정 사유',{exact:true}).fill('격리 통합 시험 오입력 정정');
    await page.getByRole('button',{name:'정정 저장',exact:true}).click();
    await expect.poll(()=>state().corrections).toBe(1);
    expect(state().items.map(item=>[item.id,item.cost,item.price])).toEqual(saved.items.map(item=>[item.id,item.cost,item.price]));
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'직전 날짜별 매입가·판매가 함께 되돌리기',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'원본 거래를 함께 복구했습니다'})).toBeVisible();
    const restored=state();
    expect(restored.receipts).toBe(0); expect(restored.batch!.status).toBe('restored'); expect(restored.products_count).toBe(745);
    for(let i=0;i<745;i++) {
      const product=restored.items.find(item=>item.code===code(i))!, cost=i<scenario.existing?100:0;
      expect(Number(product.cost)).toBe(cost); expect(Number(product.price)).toBe(i<scenario.existing?120:0);
    }
    await checkVisibleCosts(true);
    await page.screenshot({path:info.outputPath('real-stage-a-restored.png')});
    expect(Number(restored.other_cost)).toBe(999); expect(standalonePricingWrites).toBe(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}

test('real dated multipack registration stays unpriced until conversion is confirmed', async ({page})=>{
  db('seed',0);
  expect((await page.request.post('/api/customer/login',{data:{email:'ci-owner@example.test',password:process.env.STAGE_A_OWNER_PASSWORD!}})).status()).toBe(200);
  const preview=buildCatalogPreview([{상품명:'검증 다입수 제트',규격:'100g*10EA',단위:'BOX',매입가:100}],{productName:'상품명',spec:'규격',unit:'단위',cost:'매입가'},'합성 매입처');
  expect(preview.products[0].packQuantity).toBeGreaterThan(1);
  const imported=await page.request.post('/api/product-catalog/imports',{data:{action:'save-import',companyId:company,fileName:'multipack-check.xlsx',supplierName:'합성 매입처',mapping:{productName:'상품명',cost:'매입가'},products:preview.products,excludedCount:0,warnings:[]}});
  expect(imported.status()).toBe(200);
  const saved=await imported.json();
  const created=await page.request.post('/api/product-catalog/imports',{data:{action:'create-dated-standards',companyId:company,supplierProductIds:saved.unmatchedSupplierProductIds}});
  expect(created.status()).toBe(200);
  const mapping=(await created.json()).productMappings[0];
  const result=await page.request.post('/api/price-sheets/costs/date-batches',{data:{action:'save',companyId:company,batchId:randomUUID(),receiptDate:date,fileName:'multipack-check.xlsx',rows:[{
    productId:mapping.productCatalogId,supplierProductId:mapping.supplierProductId,priceDate:date,cost:100,supplierCost:100,
    selectedSourceRowNumber:2,priceSelected:true,priceHeld:false,lineKey:'multipack',productName:'검증 다입수 제트',spec:'100g*10EA',unit:'BOX',supplierName:'합성 매입처',erpCode:'',
    unitPrice:100,priceIncludesVat:false,rawValues:['synthetic']
  }]}});
  expect(result.status()).toBe(409); expect((await result.json()).message).toContain('환산을 먼저 확인');
  const current=state(); expect(current.products_count).toBe(1); expect(current.unpriced).toBe(1);
  expect(current.items[0].sales_unit).toBeNull(); expect(current.receipts).toBe(0); expect(current.batches).toBe(0);
});
