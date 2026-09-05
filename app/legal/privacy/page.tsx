import Link from "next/link";

export const metadata = {
  title: "개인정보처리방침 | MAJU Intelligence"
};

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 text-sm leading-7 text-slate-800">
      <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-6 text-amber-900">
        이 개인정보처리방침은 서비스 가입 및 OAuth(카카오·네이버·구글) 로그인 심사에 필요한 최소 요건을 충족하기 위한 기본
        템플릿입니다. 실제 서비스 운영 전 개인정보보호법 등 관련 법령에 맞춰 법률 전문가의 검토를 받고, 사업자 정보와
        개인정보보호책임자 연락처를 실제 값으로 채워 넣으시기 바랍니다.
      </p>

      <h1 className="mb-6 text-2xl font-black text-slate-950">MAJU Intelligence 개인정보처리방침</h1>

      <Section title="1. 수집하는 개인정보 항목">
        회사는 서비스 제공을 위해 다음 정보를 수집합니다.
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>가입 시: 회사명, 사업자등록번호, 담당자명, 이메일, 비밀번호(암호화 저장)</li>
          <li>소셜 로그인 시: 카카오·네이버·구글이 제공하는 이메일, 이름, 프로필 사진, 고유 식별자</li>
          <li>서비스 이용 중: 거래처(고객사의 고객) 정보, 배송·방문 기록, 위치정보(GPS), 업로드한 사진 및 엑셀 데이터</li>
          <li>자동 수집 항목: 접속 로그, 서비스 이용 기록</li>
        </ul>
      </Section>

      <Section title="2. 개인정보의 수집 및 이용 목적">
        수집한 정보는 회원 가입 및 관리, 로그인 인증, 서비스 제공(거래처·배송·영업 관리, 데이터 분석), 고객 문의 응대,
        서비스 개선 및 부정 이용 방지 목적으로만 사용합니다.
      </Section>

      <Section title="3. 개인정보의 보유 및 이용 기간">
        회원 탈퇴 또는 계약 종료 시 지체 없이 파기하는 것을 원칙으로 하되, 관련 법령에서 별도의 보존 기간을 정한 경우 그
        기간 동안 보관합니다.
      </Section>

      <Section title="4. 개인정보의 제3자 제공">
        회사는 이용자의 동의 없이 개인정보를 외부에 제공하지 않습니다. 다만 법령에 근거가 있거나, 결제 서비스 이용 시 결제대행사(PG사)에
        결제 처리에 필요한 최소한의 정보를 제공하는 경우는 예외로 합니다.
      </Section>

      <Section title="5. 개인정보의 처리 위탁">
        회사는 서비스 운영을 위해 클라우드 인프라(데이터베이스, 파일 저장소) 및 지도·경로 API 제공업체에 처리 업무를
        위탁할 수 있으며, 위탁 시 관련 법령에 따라 필요한 사항을 규정합니다.
      </Section>

      <Section title="6. 이용자의 권리">
        이용자(고객사 및 소속 직원)는 언제든지 자신의 개인정보 열람, 정정, 삭제, 처리정지를 요청할 수 있으며, [고객센터
        이메일]로 연락하면 지체 없이 조치합니다.
      </Section>

      <Section title="7. 개인정보의 안전성 확보 조치">
        비밀번호는 복호화할 수 없는 방식(해시)으로 암호화하여 저장하며, 접근 권한 관리와 로그인 시도 제한 등 기술적 조치를
        적용하고 있습니다.
      </Section>

      <Section title="8. 개인정보보호책임자">
        성명: [담당자명] · 이메일: [고객센터 이메일] · 개인정보 관련 문의는 위 연락처로 접수해주시기 바랍니다.
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
      <div className="text-slate-700">{children}</div>
    </section>
  );
}
