import Link from "next/link";
import { ArrowLeft, Home, MapPin } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-dvh bg-[#f3f6f8] px-5 py-10 text-slate-950 sm:grid sm:place-items-center">
      <section className="mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
        <div className="border-b border-slate-200 bg-slate-950 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-600">
              <MapPin className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-black">MAJU Intelligence</p>
              <p className="mt-0.5 text-xs font-semibold text-slate-300">영업·배송 운영 플랫폼</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-10 text-center sm:px-10">
          <p className="text-xs font-black tracking-[0.18em] text-teal-700">PAGE NOT FOUND</p>
          <h1 className="mt-3 text-2xl font-black tracking-tight">요청하신 화면을 찾을 수 없습니다</h1>
          <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-6 text-slate-500">
            주소가 변경되었거나 사용할 수 없는 링크입니다. 운영 지도에서 필요한 업무 화면으로 다시 이동해주세요.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
            <Link className="maju-button-primary h-11 px-5" href="/dashboard">
              <Home className="h-4 w-4" />
              지도 홈으로
            </Link>
            <Link className="maju-button-secondary h-11 px-5" href="/dashboard/login">
              <ArrowLeft className="h-4 w-4" />
              로그인 화면
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
