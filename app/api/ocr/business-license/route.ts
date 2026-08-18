import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 실제 OCR 공급자(CLOVA/Upstage/OpenAI Vision) 연동은 아직 붙어있지 않습니다. 환경변수가
// 등록돼 있어도 이 라우트는 어떤 OCR API도 호출하지 않으므로, "추출값"이라는 이름으로
// 고정된 예시 데이터를 돌려주면 사용자가 실제 사업자등록증 내용으로 착각해 그대로 저장할
// 위험이 있습니다. 그래서 환경변수 상태와 무관하게 항상 빈 extracted를 반환하고, 사용자가
// 직접 값을 입력하도록 안내합니다. 실제 OCR을 연결하면 이 자리에서 공급자 API를 호출하고
// 그 결과를 extracted에 채우도록 바꾸면 됩니다.
export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "사업자등록증 이미지 또는 PDF 파일을 업로드하세요." }, { status: 400 });
  }

  return NextResponse.json({
    confidence: 0,
    extracted: {},
    filename: file.name,
    message: "자동 OCR 추출 기능은 아직 연결되지 않았습니다. 업로드한 서류를 직접 보면서 아래 항목을 입력해주세요.",
    mode: "assistive-check",
    provider: "assistive-check",
    warnings: [
      "이 화면은 자동으로 값을 채우지 않습니다. 서류 원본을 보며 모든 항목을 직접 입력/확인하세요.",
      "신분증은 민감정보 마스킹 후 별도 첨부로 보관하세요."
    ]
  });
}
