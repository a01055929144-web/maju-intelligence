import Link from "next/link";

export const metadata = {
  title: "이용약관 | MAJU Intelligence"
};

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-sm leading-7 text-slate-800">
      <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-6 text-amber-900">
        이 약관은 서비스 가입을 위한 최소 요건을 충족하기 위해 작성한 기본 템플릿입니다. 실제 서비스 운영 전 반드시 변호사 등 법률
        전문가의 검토를 받아 사업자 정보([사업자명], [사업자등록번호], [대표자], [주소], [고객센터 연락처] 등)를 실제 값으로
        채워 넣으시기 바랍니다.
      </p>

      <h1 className="mb-6 text-2xl font-black text-slate-950">MAJU Intelligence 이용약관</h1>

      <Section title="제1조 (목적)">
        이 약관은 [사업자명](이하 &ldquo;회사&rdquo;)가 제공하는 MAJU Intelligence 서비스(이하 &ldquo;서비스&rdquo;)의 이용과
        관련하여 회사와 이용 고객사(이하 &ldquo;고객사&rdquo;) 간의 권리, 의무 및 책임 사항을 정함을 목적으로 합니다.
      </Section>

      <Section title="제2조 (서비스의 내용)">
        서비스는 고객사의 거래처(매장) 관리, 배송·영업 경로 관리, 매출·리드 데이터 분석, 직원 초대 및 협업 기능을 제공하는
        업무용 소프트웨어(SaaS)입니다. 회사는 서비스의 내용을 변경하거나 일부 기능을 추가·중단할 수 있으며, 중요한 변경 사항은
        서비스 내 공지 또는 이메일로 안내합니다.
      </Section>

      <Section title="제3조 (가입 및 계정)">
        고객사는 실제 사업자등록번호와 담당자 정보를 정확히 입력하여 가입해야 합니다. 사업자등록번호는 1개 계정만 가입할 수
        있으며, 허위 정보로 가입하거나 타인의 정보를 도용한 경우 회사는 사전 통지 없이 이용을 제한할 수 있습니다. 계정 정보(이메일,
        비밀번호)의 관리 책임은 고객사에 있으며, 제3자에게 공유하거나 유출되지 않도록 주의해야 합니다.
      </Section>

      <Section title="제4조 (고객사의 의무)">
        고객사는 서비스에 등록하는 거래처 정보, 직원 정보 등 제3자의 개인정보를 적법하게 수집·이용해야 하며, 이에 대한 책임은
        고객사에 있습니다. 고객사는 서비스를 부정한 목적으로 이용하거나 다른 이용자의 서비스 이용을 방해해서는 안 됩니다.
      </Section>

      <Section title="제5조 (요금 및 결제)">
        서비스 이용 요금, 결제 방식(사용후결제 또는 정기 자동결제) 및 환불 정책은 별도의 요금 안내 페이지 또는 계약서에 따릅니다.
        결제 관련 세부 조건은 유료 서비스 오픈 시점에 본 약관에 반영합니다.
      </Section>

      <Section title="제6조 (서비스 중단)">
        회사는 시스템 점검, 장애, 천재지변 등 불가피한 사유가 있는 경우 서비스 제공을 일시적으로 중단할 수 있으며, 사전에
        공지하는 것을 원칙으로 합니다.
      </Section>

      <Section title="제7조 (면책)">
        회사는 고객사가 입력한 데이터의 정확성에 대해 보증하지 않으며, 서비스를 통해 산출된 분석 결과는 참고 자료로만
        활용되어야 합니다. 천재지변 등 회사의 귀책사유가 없는 경우 서비스 중단에 대한 책임을 지지 않습니다.
      </Section>

      <Section title="제8조 (약관의 변경)">
        회사는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 적용일자 및 변경 사유를 서비스 내 공지 또는
        이메일로 사전 안내합니다.
      </Section>

      <Section title="제9조 (문의)">
        약관에 대한 문의는 [고객센터 이메일]로 연락해주시기 바랍니다.
      </Section>

      <p className="mt-8 text-xs font-bold text-slate-400">시행일: 2026-08-26</p>

      <Link className="mt-10 inline-block text-sm font-bold text-teal-700 underline underline-offset-4" href="/signup">
        가입 화면으로 돌아가기
      </Link>
    </main>
  );
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-base font-black text-slate-950">{title}</h2>
      <p className="text-slate-700">{children}</p>
    </section>
  );
}
