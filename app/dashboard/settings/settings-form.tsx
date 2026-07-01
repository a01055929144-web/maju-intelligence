"use client";

import { FormEvent, useState } from "react";
import { Building2, Check, MapPin, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanySettings } from "@/lib/store";

export function CompanySettingsForm({ initial }: { initial: CompanySettings }) {
  const [form, setForm] = useState({
    businessType: initial.businessType,
    name: initial.name,
    originAddress: initial.originAddress,
    ownerName: initial.ownerName
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const response = await fetch("/api/customer/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });

    setLoading(false);
    setMessage(response.ok ? "회사 설정이 저장됐습니다." : "저장에 실패했습니다. 값을 다시 확인해주세요.");
  }

  return (
    <form className="grid gap-6 lg:grid-cols-[1fr_360px]" onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <Badge className="mb-3 w-fit bg-primary/10 text-primary">
            <Building2 className="mr-1 h-3.5 w-3.5" />
            회사 설정
          </Badge>
          <CardTitle className="text-2xl">관리자가 생성한 회사 정보를 수정합니다</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            회사 계정과 최초 회사 등록은 MAJU 관리자가 생성합니다. 고객사는 운영에 필요한 기준값만 설정에서 수정합니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="space-y-1.5">
            <span className="text-xs font-bold text-muted-foreground">회사명</span>
            <input
              className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-muted-foreground">대표자/담당자</span>
              <input
                className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={form.ownerName}
                onChange={(event) => setForm({ ...form, ownerName: event.target.value })}
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-muted-foreground">업태/업종</span>
              <input
                className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={form.businessType}
                onChange={(event) => setForm({ ...form, businessType: event.target.value })}
              />
            </label>
          </div>
          <label className="space-y-1.5">
            <span className="text-xs font-bold text-muted-foreground">물류 출발지 주소</span>
            <input
              className="h-11 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={form.originAddress}
              onChange={(event) => setForm({ ...form, originAddress: event.target.value })}
              placeholder="예: 경기도 하남시 초이로 133 1층"
            />
          </label>
          {message ? (
            <p className="rounded-md bg-primary/10 px-3 py-2 text-sm font-bold text-primary">{message}</p>
          ) : null}
          <Button disabled={loading}>
            {loading ? <Check className="h-4 w-4 animate-pulse" /> : <Save className="h-4 w-4" />}
            설정 저장
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            운영 기준값
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
          <div className="rounded-md border border-border p-4">
            <p className="font-black text-foreground">계정 생성</p>
            <p className="mt-1">관리자가 회사와 관리자 계정을 먼저 생성합니다.</p>
          </div>
          <div className="rounded-md border border-border p-4">
            <p className="font-black text-foreground">설정 수정</p>
            <p className="mt-1">고객사는 회사명, 담당자, 업태, 물류 출발지를 수정합니다.</p>
          </div>
          <div className="rounded-md border border-border p-4">
            <p className="font-black text-foreground">동선 계산</p>
            <p className="mt-1">물류 출발지는 거래처 배송주소까지의 거리/시간 계산 기준으로 사용됩니다.</p>
          </div>
          <p className="text-xs">마지막 수정: {initial.updatedAt}</p>
        </CardContent>
      </Card>
    </form>
  );
}
