"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import RejectReasonModal from "@/components/shared/RejectReasonModal";

export default function AdminProductActions({
  type,
  shopProductId,
  productId,
}: {
  type: "approve_shop" | "approve_product";
  brands?: unknown[];
  shopProductId?: string;
  productId?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const request = async (action: string, extra: Record<string, unknown>) => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/products/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!response.ok) return;
      setDone(true);
      window.setTimeout(() => window.location.reload(), 400);
    } finally {
      setLoading(false);
    }
  };

  if (done) return <span className="text-[11px] font-semibold text-emerald-600">처리 완료</span>;

  if (type === "approve_product") {
    return (
      <button type="button" disabled={loading} onClick={() => request("approve_product", { productId })} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50">
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Icon name="Certified" size={12} />} 승인
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" disabled={loading} onClick={() => request("approve_shop_product", { shopProductId })} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50">
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Icon name="Check" size={12} />} 승인
      </button>
      <button type="button" disabled={loading} onClick={() => setRejecting(true)} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-red-50 px-2.5 text-[11px] font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-50"><X size={12} /> 반려</button>
      {rejecting && <RejectReasonModal loading={loading} onCancel={() => setRejecting(false)} onConfirm={(rejectionReason) => request("reject_shop_product", { shopProductId, rejectionReason })} />}
    </div>
  );
}
