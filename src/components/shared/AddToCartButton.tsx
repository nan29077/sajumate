"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
;
import { useAppDialog } from "@/components/shared/AppDialog";

interface AddToCartButtonProps {
  productId: string;
  variantId?: string | null;
  sellerId: string;
  campaignId?: string | null;
  className?: string;
  label?: string;
  disabled?: boolean;
  hideIcon?: boolean;
}

export default function AddToCartButton({
  productId,
  variantId,
  sellerId,
  campaignId,
  className = "btn-primary w-full py-3.5",
  label = "예약함에 담기",
  disabled = false,
  hideIcon = false,
}: AddToCartButtonProps) {
  const { appConfirm, appAlert } = useAppDialog();
  const router = useRouter();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);

  const handleAddToCart = async () => {
    if (disabled) return;
    if (!session) {
      router.push("/auth/login");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          variantId: variantId || null,
          sellerId,
          campaignId: campaignId || null,
          quantity: 1,
        }),
      });
      if (res.ok) {
        setAdded(true);
        setTimeout(() => setAdded(false), 2000);
        router.refresh();
      } else {
        const data = await res.json();
        await appAlert(data.error || "예약함 추가에 실패했습니다.");
      }
    } catch {
      appAlert("오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleAddToCart}
      disabled={loading || added || disabled}
      className={`${className} disabled:opacity-80 flex items-center justify-center gap-2`}
    >
      {loading ? (
        <>
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          추가 중...
        </>
      ) : added ? (
        <>담기 완료!</>
      ) : (
        <>{label}</>
      )}
    </button>
  );
}
