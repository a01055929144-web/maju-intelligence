import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const sampleExtractedFields = {
  address: "서울 성동구 성수이로 88 1층",
  bankAccount: "신한 110-000-000000",
  bankbookCopyStatus: "추가 업로드 필요",
  businessCertificateStatus: "OCR 확인 완료",
  businessRegistrationNumber: "123-10-10004",
  businessStatus: "정상",
  customerName: "성수 마주식당",
  deliveryLoadingMemo: "후문 냉장창고 앞 적재",
  email: "sungsu-maju@example.com",
  identityDocumentStatus: "마스킹 후 보관 예정",
  industry: "한식",
  openingDate: "2018-04-12",
  phone: "010-3100-1000",
  representativeName: "김민준",
  region: "성수동"
};

function getOcrProviderStatus() {
  const clovaReady = Boolean(process.env.CLOVA_OCR_INVOKE_URL && process.env.CLOVA_OCR_SECRET);
  const upstageReady = Boolean(process.env.UPSTAGE_API_KEY);
  const openAiReady = Boolean(process.env.OPENAI_API_KEY);

  if (clovaReady) return { configured: true, mode: "provider-ready", provider: "naver-clova" };
  if (upstageReady) return { configured: true, mode: "provider-ready", provider: "upstage" };
  if (openAiReady) return { configured: true, mode: "provider-ready", provider: "openai-vision" };

  return { configured: false, mode: "sample", provider: "sample" };
}

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const provider = getOcrProviderStatus();

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "사업자등록증 이미지 또는 PDF 파일을 업로드하세요." }, { status: 400 });
  }

  return NextResponse.json({
    confidence: 0.92,
    extracted: sampleExtractedFields,
    filename: file.name,
    message: provider.configured
      ? `${provider.provider} OCR 환경변수가 감지됐습니다. 현재는 표준 응답 검증 모드로 동작합니다.`
      : "샘플 OCR 추출이 완료됐습니다. 실제 OCR 공급자 연결 전 검증 응답입니다.",
    mode: provider.mode,
    provider: provider.provider,
    warnings: [
      "추출값은 사용자가 저장 전 반드시 확인해야 합니다.",
      "신분증은 민감정보 마스킹 후 별도 첨부로 보관하세요.",
      ...(!provider.configured ? ["실 OCR을 사용하려면 CLOVA_OCR_INVOKE_URL/CLOVA_OCR_SECRET 또는 UPSTAGE_API_KEY를 등록하세요."] : [])
    ]
  });
}
