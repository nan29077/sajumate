"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Settings, Calendar, Heart, Star, Bell, LogOut, ChevronRight, MapPin, Gift, Ticket, Users, Building2 } from "lucide-react";
import { signOut } from "next-auth/react";
import { pickBuyerAvatar } from "@/lib/defaults";

interface MyOverviewData {
  user: {
    id: string;
    name: string;
    email: string | null;
    avatar: string | null;
  };
  counts: {
    orders: number;
    reviews: number;
    cartItems: number;
    wishlists: number;
  };
  orders: Array<{
    id: string;
    reservationNumber: string;
    status: string;
    finalAmount: number;
    discountAmount: number | null;
    discountType: string | null;
    createdAt: string;
    seller: { shopName: string };
    items: Array<{ productName: string }>;
  }>;
  wishlists: Array<{
    id: string;
    product: {
      id: string;
      name: string;
      thumbnail: string | null;
      basePrice: number;
      comparePrice: number | null;
      brand: { brandName: string } | null;
      sellerProducts: Array<{ seller: { shopName: string } }>;
    };
  }>;
  pickedSellers: Array<{
    seller: {
      id: string;
      shopName: string;
      slug: string;
      shopLogo: string | null;
      isManualLive: boolean;
      liveStreams: Array<{ id: string; shareCode: string }>;
    };
  }>;
  gameCouponCount: number;
  sellerApplied: boolean;
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: "결제대기",
  PAID: "결제완료",
  CONFIRMED: "확인됨",
  SHIPPING: "상담 진행중",
  DELIVERED: "상담 완료",
  CANCELLED: "취소됨",
  REFUND_REQUESTED: "환불요청",
  REFUNDED: "환불완료",
};

const ORDER_STATUS_CLS: Record<string, string> = {
  DELIVERED: "bg-green-900/40 text-green-400",
  SHIPPING: "bg-blue-900/40 text-blue-400",
  CANCELLED: "bg-red-900/40 text-red-400",
};

function formatPrice(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function WatchMyPageSheet({ open, onClose }: Props) {
  const [data, setData] = useState<MyOverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open || data) return;
    setLoading(true);
    fetch("/api/my/overview")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("불러오기 실패"))
      .finally(() => setLoading(false));
  }, [open, data]);

  const handleLogout = async () => {
    await signOut({ redirect: false }).catch(() => {});
    window.location.href = "/";
  };

  const menuItems = data
    ? [
        { href: "/my/orders", icon: Calendar, label: "예약 내역", count: data.counts.orders },
        { href: "/my/reviews", icon: Star, label: "내 후기", count: data.counts.reviews },
        { href: "/my/wishlist", icon: Heart, label: "찜한 상담상품", count: data.counts.wishlists },
        { href: "/my/seller", icon: Users, label: "단골 상담사", count: data.pickedSellers.length || null },
        { href: "/my/game-coupons", icon: Gift, label: "게임 쿠폰", count: data.gameCouponCount || null },
      ]
    : [];

  const bottomMenuItems = [
    { href: "/my/notifications", icon: Bell, label: "알림" },
    { href: "/my/settings", icon: Settings, label: "설정" },
  ];

  return (
    <>
      {/* 오버레이 */}
      <div
        className="fixed inset-0 z-[90] transition-opacity duration-300"
        style={{
          backgroundColor: "rgba(0,0,0,0.6)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
        onClick={onClose}
      />

      {/* 바텀시트 */}
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-[91] bg-[#111] rounded-t-2xl"
        style={{
          maxHeight: "90vh",
          transform: open ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.3s ease-out",
        }}
      >
        {/* 핸들 + 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-1 rounded-full bg-gray-700 absolute left-1/2 -translate-x-1/2 top-2.5" />
            <span className="text-white font-semibold text-sm">마이페이지</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center"
          >
            <X size={16} className="text-gray-300" />
          </button>
        </div>

        {/* 스크롤 영역 */}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 56px)" }}>

          {/* 로딩 */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-gray-600 border-t-amber-400 rounded-full animate-spin" />
            </div>
          )}

          {/* 에러 */}
          {error && !loading && (
            <div className="text-center py-12 text-gray-500 text-sm">{error}</div>
          )}

          {/* 비로그인 */}
          {!loading && !error && !data && (
            <div className="text-center py-12 space-y-3">
              <p className="text-gray-400 text-sm">로그인이 필요합니다</p>
              <Link
                href="/auth/login"
                onClick={onClose}
                className="inline-block px-6 py-2.5 bg-amber-400 text-black text-sm font-bold rounded-xl"
              >
                로그인
              </Link>
            </div>
          )}

          {data && (
            <div className="pb-6">
              {/* ─── 프로필 카드 ─── */}
              <div className="bg-amber-400 px-4 pt-5 pb-9">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-black/10 flex items-center justify-center text-gray-900 text-lg font-bold overflow-hidden flex-shrink-0">
                    {!imgErrors["avatar"] ? (
                      <img
                        src={data.user.avatar || pickBuyerAvatar(data.user.id)}
                        alt={data.user.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={() => setImgErrors((p) => ({ ...p, avatar: true }))}
                      />
                    ) : (
                      data.user.name?.charAt(0) ?? "?"
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-gray-900 truncate">{data.user.name}</p>
                    {data.user.email && !data.user.email.endsWith("@no-email.local") && (
                      <p className="text-xs text-gray-800/70 truncate">{data.user.email}</p>
                    )}
                  </div>
                  <Link
                    href="/my/settings"
                    onClick={onClose}
                    className="p-1.5 text-gray-700"
                  >
                    <Settings size={18} strokeWidth={1.5} />
                  </Link>
                </div>
              </div>

              {/* ─── 요약 카드 ─── */}
              <div className="mx-4 -mt-5 bg-[#1a1a1a] rounded-2xl border border-gray-800 p-4 mb-4">
                <div className="grid grid-cols-3 divide-x divide-gray-800">
                  <Link href="/my/orders" onClick={onClose} className="text-center py-1">
                    <p className="text-base font-bold text-white">{data.counts.orders}</p>
                    <p className="text-[10px] text-gray-500">예약</p>
                  </Link>
                  <Link href="/my/reviews" onClick={onClose} className="text-center py-1">
                    <p className="text-base font-bold text-white">{data.counts.reviews}</p>
                    <p className="text-[10px] text-gray-500">후기</p>
                  </Link>
                  <Link href="/my/wishlist" onClick={onClose} className="text-center py-1">
                    <p className="text-base font-bold text-rose-400">{data.counts.wishlists}</p>
                    <p className="text-[10px] text-gray-500">찜</p>
                  </Link>
                </div>
              </div>

              {/* ─── 단골 상담사 미리보기 ─── */}
              {data.pickedSellers.length > 0 && (
                <div className="px-4 mb-4">
                  <div className="bg-[#1a1a1a] rounded-xl border border-gray-800 overflow-hidden">
                    <div className="flex items-center justify-between px-4 pt-3 pb-2">
                      <p className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                        <Heart size={13} className="text-pink-400 fill-pink-400" />
                        내 단골 상담사
                      </p>
                      <Link
                        href="/my/seller"
                        onClick={onClose}
                        className="text-[11px] text-amber-400 flex items-center gap-0.5"
                      >
                        전체보기 ({data.pickedSellers.length})
                        <ChevronRight size={11} />
                      </Link>
                    </div>
                    <div className="px-4 pb-3">
                      <div className="flex gap-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                        {data.pickedSellers.slice(0, 8).map(({ seller }) => {
                          const isLive = seller.liveStreams.length > 0 || seller.isManualLive;
                          const href = isLive && seller.liveStreams[0]?.shareCode
                            ? `/live/${seller.liveStreams[0].shareCode}`
                            : `/shop/${seller.slug}`;
                          return (
                            <Link
                              key={seller.id}
                              href={href}
                              onClick={onClose}
                              className="flex flex-col items-center flex-shrink-0 w-14"
                            >
                              <div
                                className={`w-12 h-12 rounded-full overflow-hidden bg-gray-700 mb-1 ring-2 ${isLive ? "ring-red-500" : "ring-gray-700"}`}
                              >
                                {seller.shopLogo && !imgErrors[seller.id] ? (
                                  <img
                                    src={seller.shopLogo}
                                    alt={seller.shopName}
                                    className="w-full h-full object-cover"
                                    onError={() => setImgErrors((p) => ({ ...p, [seller.id]: true }))}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm font-bold">
                                    {seller.shopName.charAt(0)}
                                  </div>
                                )}
                              </div>
                              {isLive && (
                                <span className="text-[8px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full mb-0.5 -mt-1">LIVE</span>
                              )}
                              <p className="text-[9px] text-gray-400 truncate w-full text-center">{seller.shopName}</p>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── 메뉴 그리드 ─── */}
              <div className="px-4 mb-4">
                <div className="grid grid-cols-4 gap-2">
                  {menuItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className="flex flex-col items-center gap-1.5 py-3 px-1 bg-[#1a1a1a] rounded-xl border border-gray-800"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center">
                        <item.icon size={16} className="text-gray-300" strokeWidth={1.5} />
                      </div>
                      <p className="text-[10px] text-gray-400 text-center leading-tight">{item.label}</p>
                      {item.count != null && item.count > 0 && (
                        <span className="text-[10px] font-bold text-amber-400">{item.count}</span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>

              {/* ─── 찜한 상담상품 ─── */}
              <div className="px-4 mb-4">
                <div className="bg-[#1a1a1a] rounded-xl border border-gray-800 overflow-hidden">
                  <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <p className="text-xs font-bold text-gray-200">
                      <Heart size={13} className="inline-block mr-1 text-rose-400 fill-rose-400" />
                      내가 찜한 상담상품
                    </p>
                    {data.counts.wishlists > 0 && (
                      <Link
                        href="/my/wishlist"
                        onClick={onClose}
                        className="text-[11px] text-amber-400"
                      >
                        전체보기 ({data.counts.wishlists})
                      </Link>
                    )}
                  </div>
                  {data.wishlists.length > 0 ? (
                    <div className="px-4 pb-3">
                      <div className="grid grid-cols-3 gap-2">
                        {data.wishlists.map((wish) => {
                          const p = wish.product;
                          const discountPct =
                            p.comparePrice && p.comparePrice > p.basePrice
                              ? Math.round((1 - p.basePrice / p.comparePrice) * 100)
                              : 0;
                          return (
                            <Link
                              key={wish.id}
                              href={`/products/${p.id}`}
                              onClick={onClose}
                              className="group"
                            >
                              <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-800 mb-1">
                                {p.thumbnail && !imgErrors[`w${wish.id}`] ? (
                                  <img
                                    src={p.thumbnail}
                                    alt={p.name}
                                    className="w-full h-full object-cover"
                                    onError={() => setImgErrors((prev) => ({ ...prev, [`w${wish.id}`]: true }))}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Star size={20} className="text-gray-600" />
                                  </div>
                                )}
                                {discountPct > 0 && (
                                  <span className="absolute top-1 left-1 bg-red-500 text-white text-[8px] font-bold px-1 py-0.5 rounded">
                                    {discountPct}%
                                  </span>
                                )}
                              </div>
                              <p className="text-[9px] text-gray-500 truncate">
                                {p.sellerProducts[0]?.seller?.shopName || p.brand?.brandName || ""}
                              </p>
                              <p className="text-[11px] font-medium text-gray-300 truncate">{p.name}</p>
                              <p className="text-[11px] font-bold text-white">{formatPrice(p.basePrice)}</p>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-600 px-4">
                      <Heart size={30} strokeWidth={1.5} className="mx-auto mb-2 opacity-30" />
                      <p className="text-xs">아직 찜한 상담상품이 없습니다.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── 최근 예약 ─── */}
              <div className="px-4 mb-4">
                <div className="bg-[#1a1a1a] rounded-xl border border-gray-800 overflow-hidden">
                  <div className="flex items-center justify-between px-4 pt-3 pb-2">
                    <p className="text-xs font-bold text-gray-200">최근 예약</p>
                    <Link href="/my/orders" onClick={onClose} className="text-[11px] text-amber-400">
                      전체보기
                    </Link>
                  </div>
                  {data.orders.length > 0 ? (
                    <div className="px-4 pb-3">
                      {data.orders.map((order) => (
                        <div
                          key={order.id}
                          className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <p className="text-sm font-bold text-gray-200 truncate">
                              {order.items[0]?.productName || "예약 상담상품"}
                              {order.items.length > 1 && (
                                <span className="text-[11px] font-normal text-gray-500">
                                  {" "}외 {order.items.length - 1}건
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              {order.seller.shopName} ·{" "}
                              {new Date(order.createdAt).toLocaleDateString("ko-KR")}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-semibold text-white">
                              {formatPrice(order.finalAmount)}
                            </p>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full ${
                                ORDER_STATUS_CLS[order.status] ?? "bg-gray-800 text-gray-400"
                              }`}
                            >
                              {ORDER_STATUS_LABEL[order.status] ?? order.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-600 px-4">
                      <Star size={30} strokeWidth={1.5} className="mx-auto mb-2 opacity-30" />
                      <p className="text-xs">아직 예약 내역이 없습니다.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── 상담사 입점 신청 ─── */}
              {!data.sellerApplied && (
                <div className="px-4 mb-4">
                  <Link
                    href="/seller-apply"
                    onClick={onClose}
                    className="flex items-center gap-3 p-4 bg-amber-900/20 rounded-xl border border-amber-800/30"
                  >
                    <Building2 size={18} className="text-amber-400" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-200">상담사로 활동하기</p>
                      <p className="text-[11px] text-gray-500">상담사 입점 신청하기</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-600" />
                  </Link>
                </div>
              )}

              {/* ─── 하단 메뉴 ─── */}
              <div className="px-4">
                <div className="bg-[#1a1a1a] rounded-xl border border-gray-800 overflow-hidden">
                  {bottomMenuItems.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={onClose}
                      className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-800"
                    >
                      <item.icon size={17} className="text-gray-400" strokeWidth={1.5} />
                      <span className="text-sm text-gray-300 flex-1">{item.label}</span>
                      <ChevronRight size={15} className="text-gray-700" />
                    </Link>
                  ))}
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
                  >
                    <LogOut size={17} className="text-red-500" strokeWidth={1.5} />
                    <span className="text-sm text-red-400 flex-1">로그아웃</span>
                    <ChevronRight size={15} className="text-gray-700" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
