"use client";

import BrandWordmark from "@/components/shared/BrandWordmark";
import { Icon } from "@/components/shared/Icon";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

function getDashboardPath(role: string): string {
  switch (role) {
    case "SUPER_ADMIN": return "/admin";
    case "CONSULTANT": return "/seller";
    case "CUSTOMER": return "/";
    default: return "/";
  }
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const role = session?.user?.role || "CUSTOMER";

  // 인증되지 않았거나 강제 재설정 대상이 아니면 접근 차단
  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      router.replace("/auth/login");
    } else if (session && !session.user?.mustResetPassword) {
      router.replace(getDashboardPath(role));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("새 비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (password !== confirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "비밀번호 재설정에 실패했습니다.");
        return;
      }
      // 토큰의 강제 재설정 플래그 해제 후 대시보드로 이동
      await update({ mustResetPassword: false });
      router.replace(getDashboardPath(role));
      router.refresh();
    } catch {
      setError("비밀번호 재설정 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (status !== "authenticated" || !session?.user?.mustResetPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <span className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="flex-shrink-0 pt-12 pb-6 text-center">
        <BrandWordmark size="lg" className="mb-3" />
        <p className="text-sm text-gray-400">새 비밀번호 설정</p>
      </div>

      <div className="flex-1 px-5 pb-8 max-w-md mx-auto w-full">
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-800">
          임시 비밀번호로 로그인하셨습니다. 계정 보호를 위해 새 비밀번호를 설정해주세요.
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <form onSubmit={handleSubmit} className="space-y-3.5" autoComplete="off">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">새 비밀번호</label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  className="input-field text-sm py-2.5 pr-10"
                  placeholder="8자 이상 입력하세요"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 active:text-gray-600"
                  onClick={() => setShow(!show)}
                >
                  <Icon name="Eye" size={18} />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">새 비밀번호 확인</label>
              <input
                type={show ? "text" : "password"}
                className="input-field text-sm py-2.5"
                placeholder="비밀번호를 다시 입력하세요"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            {error && (
              <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <button
              type="submit"
              className="btn-primary w-full py-3 text-sm"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2 justify-center">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  설정 중...
                </span>
              ) : (
                "비밀번호 변경하고 시작하기"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
