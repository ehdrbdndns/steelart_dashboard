"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { BlockingOverlay } from "@/components/ui/blocking-overlay";
import { Button } from "@/components/ui/button";
import {
  AUTH_REQUIRED_ALERT_MESSAGE,
  AUTH_REQUIRED_REASON,
  DEFAULT_ADMIN_REDIRECT,
  getSafeAdminRedirect,
  normalizeRedirectPath,
} from "@/lib/auth/redirect";

const schema = z.object({
  email: z.string().email("이메일 형식이 올바르지 않습니다."),
  password: z.string().min(1, "비밀번호를 입력해 주세요."),
});

type FormValues = z.infer<typeof schema>;

const INVALID_LOGIN_MESSAGE = "이메일 또는 비밀번호가 올바르지 않습니다.";

export default function AdminLoginPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [nextPath, setNextPath] = useState(DEFAULT_ADMIN_REDIRECT);
  const hasShownAlertRef = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    const nextUrl = new URL(window.location.href);
    const resolvedNextPath = getSafeAdminRedirect(
      nextUrl.searchParams.get("next"),
      DEFAULT_ADMIN_REDIRECT,
    );

    setNextPath(resolvedNextPath);

    if (
      nextUrl.searchParams.get("reason") !== AUTH_REQUIRED_REASON ||
      hasShownAlertRef.current
    ) {
      return;
    }

    hasShownAlertRef.current = true;
    nextUrl.searchParams.delete("reason");

    if (resolvedNextPath === DEFAULT_ADMIN_REDIRECT) {
      nextUrl.searchParams.delete("next");
    } else {
      nextUrl.searchParams.set("next", resolvedNextPath);
    }

    window.history.replaceState(
      window.history.state,
      "",
      `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
    );
    window.alert(AUTH_REQUIRED_ALERT_MESSAGE);
  }, []);

  const onSubmit = async (values: FormValues) => {
    setMessage("");
    setIsAuthenticating(true);

    try {
      const result = await signIn("credentials", {
        ...values,
        redirect: false,
        callbackUrl: nextPath,
      });

      if (!result || result.error) {
        setIsAuthenticating(false);
        setMessage(INVALID_LOGIN_MESSAGE);
        return;
      }

      const destination = getSafeAdminRedirect(
        normalizeRedirectPath(result.url),
        nextPath,
      );

      router.push(destination);
      router.refresh();
    } catch {
      setIsAuthenticating(false);
      setMessage("로그인 처리 중 문제가 발생했습니다. 다시 시도해 주세요.");
    }
  };

  const isBusy = isSubmitting || isAuthenticating;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-950">
      <BlockingOverlay
        open={isAuthenticating}
        title="로그인 처리 중입니다..."
        description="관리자 권한을 확인하고 있습니다."
      />
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-md space-y-4 rounded-lg border bg-white p-6 shadow dark:bg-slate-900"
      >
        <div>
          <h1 className="text-2xl font-semibold">SteelArt 관리자 로그인</h1>
          <p className="text-sm text-muted-foreground">
            관리자 이메일과 비밀번호를 입력하세요.
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">이메일</label>
          <input
            type="email"
            autoComplete="email"
            className="w-full rounded-md border px-3 py-2"
            disabled={isBusy}
            {...register("email")}
          />
          {errors.email ? (
            <p className="text-sm text-red-500">{errors.email.message}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">비밀번호</label>
          <input
            type="password"
            autoComplete="current-password"
            className="w-full rounded-md border px-3 py-2"
            disabled={isBusy}
            {...register("password")}
          />
          {errors.password ? (
            <p className="text-sm text-red-500">{errors.password.message}</p>
          ) : null}
        </div>

        {message ? <p className="text-sm text-red-500">{message}</p> : null}

        <Button type="submit" className="w-full" disabled={isBusy}>
          {isBusy ? "로그인 중..." : "로그인"}
        </Button>
      </form>
    </div>
  );
}
