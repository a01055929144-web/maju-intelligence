import Link from "next/link";
import { CheckCircle2, Link2, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CustomerAuthConnection } from "@/lib/store";

const providerMeta: Record<CustomerAuthConnection["provider"], { href?: string; label: string; icon: typeof Mail }> = {
  email: { label: "이메일", icon: Mail },
  kakao: { href: "/api/auth/kakao/start?mode=connect", label: "카카오", icon: MessageCircle },
  naver: { href: "/api/auth/naver/start?mode=connect", label: "네이버", icon: Link2 },
  google: { href: "/api/auth/google/start?mode=connect", label: "구글", icon: Link2 }
};

export function AccountConnectionsPanel({ connections }: { connections: CustomerAuthConnection[] }) {
  return (
    <section className="maju-section-card">
      <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="maju-section-title">통합 로그인</p>
          <p className="mt-1 maju-muted-label normal-case tracking-normal">이메일과 소셜 로그인을 같은 사용자 계정에 연결합니다.</p>
        </div>
        <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">
          <ShieldCheck className="mr-1 h-3.5 w-3.5" />
          계정 연결
        </Badge>
      </div>
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        {connections.map((connection) => {
          const meta = providerMeta[connection.provider];
          const Icon = meta.icon;
          return (
            <div key={connection.provider} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-700">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-black text-slate-950">{meta.label}</p>
                    <p className="text-xs font-bold text-slate-500">{connection.connected ? "연결됨" : "미연결"}</p>
                  </div>
                </div>
                {connection.connected ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
              </div>
              <p className="mt-3 min-h-5 truncate text-xs font-bold text-slate-500">{connection.email || connection.lastUsedAt || "계정 연결 가능"}</p>
              {meta.href && !connection.connected ? (
                <Link
                  className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-800 shadow-[0_1px_0_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:bg-slate-50"
                  href={meta.href}
                >
                  연결하기
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
