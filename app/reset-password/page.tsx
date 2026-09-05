import { KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({ searchParams }: { searchParams?: Promise<{ token?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const token = resolvedSearchParams?.token || "";

  return (
    <main className="flex min-h-screen items-center justify-center maju-app-bg px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Badge className="mb-3 w-fit bg-primary/10 text-primary">
            <KeyRound className="mr-1 h-3.5 w-3.5" />
            MAJU Company
          </Badge>
          <CardTitle className="text-2xl">비밀번호 재설정</CardTitle>
        </CardHeader>
        <CardContent>
          {token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <p className="rounded-md bg-destructive/10 px-3 py-3 text-sm font-bold leading-6 text-destructive">
              재설정 링크가 올바르지 않습니다. 비밀번호 찾기를 다시 요청해주세요.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
