import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { createCatalogFromSupplierProducts, listProductImportWorkspace, saveProductCatalogImport } from "@/lib/product-catalog-import";
import type { CatalogMapping, ParsedProduct } from "@/domains/product/catalog-import";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope=await getRequestAuthScope(request,request.nextUrl.searchParams.get("companyId")||undefined);
  if(!scope.ok)return NextResponse.json({message:"Unauthorized"},{status:401});
  if(!scopeHasCapability(scope,"manage_sales"))return NextResponse.json({message:"상품 원장을 조회할 권한이 없습니다."},{status:403});
  try{return NextResponse.json(await listProductImportWorkspace(scope.companyId!));}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"유통사 상품을 불러오지 못했습니다."},{status:500});}
}

export async function POST(request: NextRequest) {
  const body=await request.json().catch(()=>null) as null|{action?:string;companyId?:string;fileName?:string;supplierName?:string;mapping?:CatalogMapping;products?:ParsedProduct[];excludedCount?:number;warnings?:string[];supplierProductIds?:string[]};
  const scope=await getRequestAuthScope(request,body?.companyId);
  if(!scope.ok)return NextResponse.json({message:"Unauthorized"},{status:401});
  if(!scopeHasCapability(scope,"manage_sales"))return NextResponse.json({message:"상품 원장을 수정할 권한이 없습니다."},{status:403});
  try{
    if(body?.action==="create-standards")return NextResponse.json(await createCatalogFromSupplierProducts(scope.companyId!,body.supplierProductIds||[]));
    if(body?.action!=="save-import"||!body.fileName||!body.supplierName||!body.mapping||!Array.isArray(body.products))return NextResponse.json({message:"업로드 정보를 확인해 주세요."},{status:400});
    const actorName=scope.customerSession?.name||scope.adminSession?.name||"운영자";
    return NextResponse.json(await saveProductCatalogImport({companyId:scope.companyId!,createdByName:actorName,fileName:body.fileName,supplierName:body.supplierName,mapping:body.mapping,products:body.products,excludedCount:Number(body.excludedCount)||0,warnings:Array.isArray(body.warnings)?body.warnings:[]}));
  }catch(error){const message=error instanceof Error?error.message:"상품 업로드를 저장하지 못했습니다.";return NextResponse.json({message},{status:/입력|선택|없습니다/.test(message)?400:500});}
}
