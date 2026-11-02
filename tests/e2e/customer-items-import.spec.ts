import { expect, test } from "@playwright/test";

for (const width of [1440,390]) {
  test(`customer item file original/edit/save and failure at ${width}px`,async({browser},testInfo)=>{
    const context=await browser.newContext({viewport:{width,height:900}});
    let saved:Record<string,unknown>|undefined;
    let fail=true;
    await context.route("**/api/product-catalog/imports*",route=>route.fulfill({json:{catalogCount:0,imports:[],items:[],suppliers:[]}}));
    await context.route("**/api/customers/items/import*",async route=>{
      if(route.request().method()==="GET")return route.fulfill({json:{customers:[{id:"00000000-0000-4000-8000-000000000002",name:"합성 매장"}],products:[{id:"00000000-0000-4000-8000-000000000003",code:"001"}]}});
      saved=route.request().postDataJSON();
      return route.fulfill({status:fail?409:200,json:fail?{message:"합성 검증: 같은 날짜의 단가를 확인해 주세요."}:{applied:1,skipped:0,replayed:false}});
    });
    const page=await context.newPage();
    try {
      await page.goto("/customer-items-import/preview");
      await page.getByRole("button",{name:"전체 상품 업로드",exact:true}).click();
      await page.getByRole("radio",{name:/^거래처 원장/}).click();
      const upload=page.getByLabel("거래처 품목 파일");
      await expect(upload).toBeEnabled();
      await upload.setInputFiles({name:"합성_거래처_품목.csv",mimeType:"text/csv",buffer:Buffer.from("\uFEFF거래처명,ERP 상품코드,판매 단위,최근 실제 단가,거래일,과세 구분,부가세 포함 여부\n\n합성 매장,001,kg,1100,2026-10-30,과세,별도\n","utf8")});
      await page.getByRole("button",{name:"원본 확인 · 수정",exact:true}).click();
      const price=page.getByRole("textbox",{name:width===390?/^최근 실제 단가/:"3행 최근 실제 단가",exact:true});
      await price.fill("1200");
      await expect(page.getByText("원본: 1100").filter({visible:true})).toBeVisible();
      await page.getByText("원본: 1100").filter({visible:true}).scrollIntoViewIfNeeded();
      await expect(page.getByRole("button",{name:"최종 확인",exact:true})).toBeEnabled();
      await page.screenshot({path:testInfo.outputPath(`customer-items-edit-${width}.png`),fullPage:true});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+3)).toBe(false);
      await page.getByRole("button",{name:"최종 확인",exact:true}).click();
      await page.getByRole("button",{name:"확인 후 저장",exact:true}).click();
      await expect(page.getByRole("dialog").getByRole("alert")).toContainText("같은 날짜");
      await page.getByRole("button",{name:"이전",exact:true}).click();
      await expect(price).toHaveValue("1200");
      fail=false;
      await page.getByRole("button",{name:"최종 확인",exact:true}).click();
      await page.getByRole("button",{name:"확인 후 저장",exact:true}).click();
      await expect(page.getByText(/거래처 품목 반영 1건/)).toBeVisible();
      const rows=saved?.editedRows as {sourceRowNumber:number;originalValues:Record<string,string>;values:Record<string,string>}[];
      expect(rows[0].sourceRowNumber).toBe(3);
      expect(rows[0].originalValues.lastPrice).toBe("1100");
      expect(rows[0].values.lastPrice).toBe("1200");
      expect(rows[0].values.productCode).toBe("001");
    }finally{await context.close()}
  });
}
