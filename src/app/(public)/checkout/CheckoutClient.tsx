"use client";

import { Icon } from '@/components/shared/Icon';
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Minus, CreditCard, Smartphone, Landmark, X } from 'lucide-react';
import SafeImage from "@/components/shared/SafeImage";
import { useAppDialog } from "@/components/shared/AppDialog";
import BookingContactForm from "@/components/shared/BookingContactForm";

interface CheckoutItem {
  // PRODUCT: 카탈로그 상담상품(Product) / DIRECT: 상담사 일반상담상품(DirectProduct)
  itemType: "PRODUCT" | "DIRECT";
  productId: string;
  name: string;
  thumbnail: string | null;
  sellerId: string;
  sellerName: string;
  variantId: string | null;
  variantName: string | null;
  campaignId: string | null;
  campaignTitle: string | null;
  price: number;
  quantity: number;
  isCampaign: boolean;
  shippingFee: number;
  freeShipping: boolean;
  freeShippingThreshold: number | null;
}

// 장바구니 할인 설정 (상담사별) — 소계가 threshold 이상이면 rate% 할인
interface CartDiscountInfo {
  threshold: number;
  rate: number;
  label: string;
}

interface SeedpayPrepareResponse {
  pgJsUrl: string;
  isProduction: boolean;
  form: Record<string, string>;
}

type PayMethod = "CARD" | "EASYPAY" | "BANK";

const PAY_METHODS: { value: PayMethod; label: string; description: string; icon: typeof CreditCard }[] = [
  { value: "CARD", label: "카드결제", description: "신용/체크카드", icon: CreditCard },
  { value: "EASYPAY", label: "간편결제", description: "카드·카카오·네이버페이", icon: Smartphone },
  { value: "BANK", label: "간편계좌", description: "계좌이체", icon: Landmark },
];

const formatPrice = (n: number) => n.toLocaleString("ko-KR") + "원";

const SEEDPAY_PG_JS_URL = "https://pay.seedpayments.co.kr/js/pgAsistant.js";

// pgAsistant.js — postMessage 콜백(returnData) 및 payResultSubmit 함수를 위해 로드.
// SendPay() 자체는 사용하지 않고(Next.js 환경에서 iframe target lookup 실패) 직접 모달을 만든다.
function loadSeedpayScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("server"));
    if ((window as any).SendPay) return resolve();
    const existing = document.querySelector('script[data-seedpay="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("스크립트 로드 실패")));
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.seedpay = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("결제 모듈을 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
}

// PG 결제 모달. iframe.src 로 same-origin launch endpoint 를 로드하여 iframe 내부에서
// 자체적으로 PG 결제창으로 form 을 post 한다. cross-frame target lookup 회피.
//
// onCloseRequest: 사용자가 X 버튼/mask/ESC 로 닫으려 할 때 호출. 모달 자체 제거는
// 호출자가 confirm 결과에 따라 closePgModal() 로 직접 해야 한다.
function openPgModal(launchPath: string, onCloseRequest?: () => void) {
  closePgModal();

  const layer = document.createElement("div");
  layer.id = "pg_layer";

  const mask = document.createElement("div");
  mask.id = "pgPayMask";
  mask.style.cssText =
    "position:fixed;z-index:9000;background:#000;opacity:0.6;left:0;top:0;width:100%;height:100%;";
  if (onCloseRequest) mask.addEventListener("click", onCloseRequest);
  layer.appendChild(mask);

  const win = document.createElement("div");
  win.id = "pgPayWindow";
  win.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;z-index:10000;";

  const iframe = document.createElement("iframe");
  iframe.id = "pg_pay_frame";
  iframe.name = "pg_pay_frame";
  iframe.setAttribute("frameborder", "no");
  iframe.setAttribute("scrolling", "no");
  iframe.style.cssText = "width:100%;height:100%;border:0;display:block;background:#fff;";

  iframe.src = launchPath;

  win.appendChild(iframe);

  // 좌상단 X 닫기 버튼 — iframe 위에 떠있으므로 PG 결제창 UI 와 무관하게 항상 동작.
  // PG 결제창 자체 X 는 우상단에 있으므로, 겹치지 않도록 좌상단에 배치한다.
  if (onCloseRequest) {
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "결제 취소");
    closeBtn.innerHTML = "&times;";
    closeBtn.style.cssText =
      "position:fixed;top:12px;left:12px;width:40px;height:40px;border:0;border-radius:50%;background:rgba(0,0,0,0.55);color:#fff;font-size:24px;line-height:1;cursor:pointer;z-index:10001;display:flex;align-items:center;justify-content:center;";
    closeBtn.addEventListener("click", onCloseRequest);
    layer.appendChild(closeBtn);
  }

  layer.appendChild(win);
  document.body.appendChild(layer);

  // ESC 키
  if (onCloseRequest) {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRequest();
    };
    document.addEventListener("keydown", onKey);
    (layer as any).__escHandler = onKey;
  }
}

function closePgModal() {
  const old = document.getElementById("pg_layer");
  if (!old) return;
  const handler = (old as any).__escHandler;
  if (handler) document.removeEventListener("keydown", handler);
  old.remove();
}

function openSeedpayModal(orderId: string, payMethod: string, onCloseRequest?: () => void) {
  openPgModal(
    `/api/payments/seedpay/launch?orderId=${encodeURIComponent(orderId)}&payMethod=${encodeURIComponent(payMethod)}`,
    onCloseRequest,
  );
}

// SmartroPAY-1.0.min.js 로드. 라이브러리는 LayerPopup/리다이렉트 분기와
// 가맹점 도메인 검증을 위해 반드시 필요.
function loadSmartropayScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("server"));
    if ((window as any).smartropay) return resolve();
    const existing = document.querySelector('script[data-smartropay="1"]') as HTMLScriptElement | null;
    if (existing) {
      if (existing.src === src) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("스크립트 로드 실패")));
        return;
      }
      existing.remove();
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.smartropay = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("스마트로 결제 모듈을 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
}

// SmartroPAY 호출용 hidden form 생성. id="tranMgr" 는 라이브러리가 찾는 고정값.
function buildSmartropayForm(fields: Record<string, string>) {
  const existing = document.getElementById("tranMgr");
  if (existing) existing.remove();
  const form = document.createElement("form");
  form.id = "tranMgr";
  form.name = "tranMgr";
  form.method = "POST";
  form.acceptCharset = "UTF-8";
  for (const [k, v] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = k;
    input.value = v;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  return form;
}

export default function CheckoutClient({ item }: { item: CheckoutItem }) {
  const router = useRouter();
  const { appAlert, appConfirm } = useAppDialog();
  const [quantity, setQuantity] = useState(item.quantity);
  const [ordering, setOrdering] = useState(false);
  const [contact, setContact] = useState({ name: "", phone: "", memo: "" });
  const [cartDiscount, setCartDiscount] = useState<CartDiscountInfo | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod | null>(null);
  const pendingOrderIdRef = useRef<string | null>(null);
  // 같은 페이지 모달/팝업 결제(데스크톱 SeedPay·스마트로) 진행 중에만 true.
  // 이 값이 true 인 상태로 페이지를 이탈하면 PENDING 예약을 자동 abort 해 재고를 복원한다.
  // 전체 페이지 리다이렉트형 결제(ONGI 계좌·모바일 SeedPay)는 정상 이동도 이탈로 오인되므로 arm 하지 않는다.
  const exitAbortArmedRef = useRef<boolean>(false);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(null);
  const [couponDiscountAmount, setCouponDiscountAmount] = useState(0);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  // SNS 계정 (선택사항)
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [snsHandles, setSnsHandles] = useState<Record<string, string>>({});

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  };

  useEffect(() => {
    fetch(`/api/buyer/discount-info?sellerId=${item.sellerId}`)
      .then((r) => r.json())
      .then((d) => setCartDiscount(d.cartDiscount || null))
      .catch(() => {});
  }, [item.sellerId]);

  // ONGI 결제창은 외부 도메인으로 same-window 이동하므로, 사용자가 결제를 끝내지 않고
  // 닫거나 브라우저 뒤로 돌아오면 예약이 PENDING 으로 남는다. 결제 직전 sessionStorage
  // 에 orderId 를 저장해두고, /checkout 재진입 시 자동으로 abort 한다.
  // (이미 COMPLETED 면 abort 가 400 으로 no-op → 안전.)
  useEffect(() => {
    // ONGI(간편계좌)·SeedPay 모바일 카드결제는 외부/전체페이지로 이동하므로, 결제를 끝내지 않고
    // 복귀하면 예약이 PENDING 으로 남는다. 재진입 시 자동 abort. (COMPLETED 면 abort 400 no-op → 안전.)
    const STALE_KEYS = ["pendingOngiOrderId", "pendingSeedpayOrderId"];
    for (const key of STALE_KEYS) {
      const stale = typeof window !== "undefined" ? sessionStorage.getItem(key) : null;
      if (stale) {
        sessionStorage.removeItem(key);
        fetch(`/api/orders/${stale}/abort`, { method: "POST" }).catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    loadSeedpayScript(SEEDPAY_PG_JS_URL).catch(() => {});
  }, []);

  // SeedPay 결제창 콜백 — 함수명 변경 불가.
  useEffect(() => {
    const w = window as any;
    w.pay_result_submit = function pay_result_submit() {
      // 결제 성공 진행 → 이탈 abort 해제(완료될 예약을 취소하지 않도록).
      exitAbortArmedRef.current = false;
      pendingOrderIdRef.current = null;
      try {
        w.payResultSubmit?.();
      } catch (e) {
        console.error("[seedpay] payResultSubmit threw", e);
      }
    };
    w.pay_result_close = function pay_result_close() {
      exitAbortArmedRef.current = false;
      const oid = pendingOrderIdRef.current;
      pendingOrderIdRef.current = null;
      setOrdering(false);
      closePgModal();
      if (oid) {
        fetch(`/api/orders/${oid}/abort`, { method: "POST" }).catch(() => {});
      }
      appAlert("결제를 취소하였습니다.");
    };
    return () => {
      try {
        delete w.pay_result_submit;
        delete w.pay_result_close;
      } catch {}
    };
  }, [appAlert]);

  // 결제 미완료 상태로 페이지를 이탈(브라우저 뒤로가기·탭 닫기·SPA 라우팅 등)하면
  // 예약 생성 시 차감된 일반상담상품(DirectProduct) 재고가 PENDING 예약에 묶여 "품절"이 된다.
  // 이탈 시점에 자동으로 abort 를 호출해 재고를 즉시 복원한다.
  // - exitAbortArmedRef 가 true(같은 페이지 모달/팝업 결제 진행 중)인 경우에만 동작.
  // - 결제 성공 콜백에서 disarm 하므로 완료될 결제를 취소하지 않는다.
  // - 30분 뒤 서버 스위퍼(cleanupStalePendingOrders)도 동일하게 재고를 복원하는 최종 안전망이다.
  useEffect(() => {
    const abortPending = (useBeacon: boolean) => {
      if (!exitAbortArmedRef.current) return;
      const oid = pendingOrderIdRef.current;
      if (!oid) return;
      exitAbortArmedRef.current = false;
      pendingOrderIdRef.current = null;
      const url = `/api/orders/${oid}/abort`;
      // 페이지 언로드(하드 내비게이션) 중에는 fetch 가 취소될 수 있어 sendBeacon 사용.
      if (useBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        try {
          navigator.sendBeacon(url);
          return;
        } catch {
          /* fallthrough to fetch */
        }
      }
      fetch(url, { method: "POST", keepalive: true }).catch(() => {});
    };
    const onPageHide = () => abortPending(true);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      // SPA 소프트 내비게이션(뒤로가기)으로 컴포넌트가 언마운트될 때 복원.
      abortPending(false);
    };
  }, []);

  const totalPrice = item.price * quantity;
  // 장바구니 할인 — 소계가 기준금액 이상이면 적용 (확정 계산은 서버 api/orders)
  const cartDiscountEligible = !!cartDiscount && totalPrice >= cartDiscount.threshold;
  const discountAmount =
    cartDiscount && cartDiscountEligible ? Math.round(totalPrice * cartDiscount.rate / 100) : 0;
  // 라이브 점사는 배송이 없어 배송비를 더하지 않는다.
  const finalTotal = totalPrice - discountAmount - couponDiscountAmount;

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    setCouponError(null);
    try {
      const res = await fetch(`/api/coupons/validate?code=${encodeURIComponent(couponInput.trim())}&totalAmount=${totalPrice}&sellerId=${encodeURIComponent(item.sellerId)}`);
      const data = await res.json();
      if (data.valid) {
        setAppliedCouponCode(couponInput.trim().toUpperCase());
        setCouponDiscountAmount(data.discountAmount);
        setCouponError(null);
      } else {
        setAppliedCouponCode(null);
        setCouponDiscountAmount(0);
        setCouponError(data.error || "쿠폰 적용에 실패했습니다.");
      }
    } catch {
      setCouponError("쿠폰 확인 중 오류가 발생했습니다.");
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCouponCode(null);
    setCouponDiscountAmount(0);
    setCouponInput("");
    setCouponError(null);
  };

  const handleOrder = async () => {
    if (!contact.name || !contact.phone) {
      appAlert("예약자 이름과 연락처를 입력해주세요.");
      return;
    }
    if (!payMethod) {
      appAlert("결제 수단을 선택해주세요.");
      return;
    }

    const isMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(
      navigator.userAgent,
    );

    setOrdering(true);
    try {
      // SNS 계정 (선택사항) — 선택 + 입력값이 있는 플랫폼만 포함
      const snsAccounts = selectedPlatforms
        .filter((p) => snsHandles[p]?.trim())
        .map((p) => ({ platform: p, handle: snsHandles[p].trim() }));
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerId: item.sellerId,
          campaignId: null,
          items: [{
            itemType: item.itemType,
            productId: item.productId,
            variantId: item.variantId,
            productName: item.name,
            variantName: item.variantName,
            price: item.price,
            quantity,
          }],
          customerName: contact.name,
          customerPhone: contact.phone,
          shippingMemo: contact.memo,
          snsAccounts: snsAccounts.length > 0 ? snsAccounts : undefined,
          couponCode: appliedCouponCode || undefined,
        }),
      });

      if (!orderRes.ok) {
        const data = await orderRes.json().catch(() => ({}));
        appAlert(data.error || "예약 생성에 실패했습니다.");
        setOrdering(false);
        return;
      }
      const { order } = await orderRes.json();
      const orderId: string = order.id;
      pendingOrderIdRef.current = orderId;

      // 결제 분기: BANK → ONGI(계좌), EASYPAY → 스마트로(간편결제+카드), CARD → SeedPay.
      if (payMethod === "EASYPAY") {
        const prepRes = await fetch("/api/payments/smartropay/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, payMethod: "CARD" }),
        });
        if (!prepRes.ok) {
          const data = await prepRes.json().catch(() => ({}));
          await fetch(`/api/orders/${orderId}/abort`, { method: "POST" }).catch(() => {});
          pendingOrderIdRef.current = null;
          appAlert(data.error || "결제 준비에 실패했습니다.");
          setOrdering(false);
          return;
        }
        const prep = (await prepRes.json()) as {
          jsUrl: string;
          mode: string;
          form: Record<string, string>;
        };
        // SmartroPAY-1.0.min.js 를 로드해 smartropay.payment() 호출.
        // 직접 form POST 는 가맹점 도메인 검증/세션 컨텍스트를 우회해 "지원하지 않는 브라우저"
        // 응답이 나옴. 반드시 라이브러리를 통해 호출해야 함.
        try {
          await loadSmartropayScript(prep.jsUrl);
        } catch (e: any) {
          await fetch(`/api/orders/${orderId}/abort`, { method: "POST" }).catch(() => {});
          pendingOrderIdRef.current = null;
          appAlert(e?.message || "결제 모듈 로드 실패");
          setOrdering(false);
          return;
        }
        buildSmartropayForm(prep.form);
        const sp = (window as any).smartropay;
        if (!sp || typeof sp.init !== "function" || typeof sp.payment !== "function") {
          await fetch(`/api/orders/${orderId}/abort`, { method: "POST" }).catch(() => {});
          pendingOrderIdRef.current = null;
          appAlert("결제 모듈이 초기화되지 않았습니다.");
          setOrdering(false);
          return;
        }
        // 인증결제: init 에는 mode 만 전달. actionUri(/ssp/reqPay.do)를 넘기면 SS-Pay 간편결제
        // 경로로 동작해 "SspMallId 정보 확인" 알림이 뜨므로 절대 전달하지 않는다.
        sp.init({ mode: prep.mode });
        // PC Callback 은 통상 { Tid, TrAuthKey, ResultCode, ResultMsg } 만 전달.
        // 모바일은 Smartro 가 ReturnUrl 로 원본 form 의 전체 필드를 echo 하므로 다른 경로.
        // result endpoint 에서 예약 매핑(MallReserved/Moid) 과 금액 검증(Amt) 이 필요하므로
        // closure 의 예약 정보를 보강해 forward. res 의 값이 있으면 res 우선.
        const fallbackFields: Record<string, string> = {
          MallReserved: orderId,
          Moid: order.reservationNumber || "",
          Amt: String(Math.round(Number(order.finalAmount || finalTotal))),
        };
        sp.payment({
          FormId: "tranMgr",
          Callback: (res: Record<string, string>) => {
            // 결제 결과 제출(성공) 진행 → 이탈 abort 해제.
            exitAbortArmedRef.current = false;
            pendingOrderIdRef.current = null;
            const merged: Record<string, string> = { ...fallbackFields, ...(res || {}) };
            const cb = document.createElement("form");
            cb.method = "POST";
            cb.action = "/api/payments/smartropay/result";
            cb.acceptCharset = "UTF-8";
            for (const [k, v] of Object.entries(merged)) {
              if (v == null) continue;
              const input = document.createElement("input");
              input.type = "hidden";
              input.name = k;
              input.value = String(v);
              cb.appendChild(input);
            }
            document.body.appendChild(cb);
            cb.submit();
          },
        });
        // 데스크톱 스마트로는 팝업 결제창을 띄우고 부모 페이지는 /checkout 에 머무른다.
        // 이 상태에서 브라우저 뒤로가기 등으로 이탈하면 재고가 묶이므로 이탈 abort 를 arm.
        // (모바일은 상단 창이 리다이렉트될 수 있어 정상 결제 이동을 이탈로 오인하므로 arm 하지 않음.)
        exitAbortArmedRef.current = !isMobile;
        return;
      }

      if (payMethod === "BANK") {
        const prepRes = await fetch("/api/payments/ongi/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });
        if (!prepRes.ok) {
          const data = await prepRes.json().catch(() => ({}));
          await fetch(`/api/orders/${orderId}/abort`, { method: "POST" }).catch(() => {});
          pendingOrderIdRef.current = null;
          appAlert(data.error || "결제 준비에 실패했습니다.");
          setOrdering(false);
          return;
        }
        const { checkoutUrl } = (await prepRes.json()) as { checkoutUrl: string };
        // ONGI 결제창은 같은 창에서 이동(앱 웹뷰 호환). 완료 후 return_url 로 복귀한다.
        // 사용자가 결제를 중단하고 뒤로가기로 복귀하면 mount 시 cleanup 이 PENDING 예약을 abort.
        sessionStorage.setItem("pendingOngiOrderId", orderId);
        window.location.href = checkoutUrl;
        return;
      }

      // CARD → SeedPay.
      // 모바일 SeedPay 결제창은 리다이렉트 기반(pgAsistant.js 모바일 분기)이라, iframe 으로 띄우면
      // 결제창 닫기 시 SeedPay 도메인 상대경로로 이동해 Whitelabel Error Page 가 뜬다.
      // → 모바일은 벤더 기본 동작과 동일하게 launch 엔드포인트로 전체 페이지 이동(top-level POST)한다.
      // 완료/취소 후 SeedPay 가 절대 returnUrl(/result)로 복귀시키고, 중단 시 복귀하면 cleanup 이 abort.
      if (isMobile) {
        sessionStorage.setItem("pendingSeedpayOrderId", orderId);
        window.location.href =
          `/api/payments/seedpay/launch?orderId=${encodeURIComponent(orderId)}` +
          `&payMethod=${encodeURIComponent(payMethod)}&full=1`;
        return;
      }

      const prepRes = await fetch("/api/payments/seedpay/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, payMethod }),
      });
      if (!prepRes.ok) {
        const data = await prepRes.json().catch(() => ({}));
        await fetch(`/api/orders/${orderId}/abort`, { method: "POST" }).catch(() => {});
        pendingOrderIdRef.current = null;
        appAlert(data.error || "결제 준비에 실패했습니다.");
        setOrdering(false);
        return;
      }
      const prep: SeedpayPrepareResponse = await prepRes.json();

      try {
        await loadSeedpayScript(SEEDPAY_PG_JS_URL);
      } catch (e: any) {
        await fetch(`/api/orders/${orderId}/abort`, { method: "POST" }).catch(() => {});
        pendingOrderIdRef.current = null;
        appAlert(e?.message || "결제 모듈 로드 실패");
        setOrdering(false);
        return;
      }

      // pgAsistant.js 의 message listener (returnData) 와 payResultSubmit 함수가 부모에서
      // 활성 상태여야 SeedPay 결제 완료 후 콜백이 처리된다.
      if (typeof (window as any).payResultSubmit !== "function") {
        appAlert("결제 모듈이 초기화되지 않았습니다. 새로고침 후 다시 시도해주세요.");
        await fetch(`/api/orders/${orderId}/abort`, { method: "POST" }).catch(() => {});
        pendingOrderIdRef.current = null;
        setOrdering(false);
        return;
      }
      // 모달 닫기 핸들러 — X 버튼·mask 클릭·ESC 시 발동.
      // 이중 클릭 가드: 한번 트리거되면 즉시 비활성화.
      let closeArmed = true;
      const handleClose = async () => {
        if (!closeArmed) return;
        const ok = await appConfirm("결제를 취소하시겠습니까?");
        if (!ok) return;
        closeArmed = false;
        exitAbortArmedRef.current = false;
        closePgModal();
        const oid = pendingOrderIdRef.current;
        pendingOrderIdRef.current = null;
        setOrdering(false);
        if (oid) {
          fetch(`/api/orders/${oid}/abort`, { method: "POST" }).catch(() => {});
        }
      };
      // 데스크톱 SeedPay 는 같은 페이지 위 모달(iframe)로 결제한다. 이 상태로 브라우저 뒤로가기
      // 등으로 이탈하면 handleClose 가 발동하지 않아 재고가 묶이므로 이탈 abort 를 arm.
      exitAbortArmedRef.current = true;
      openSeedpayModal(orderId, payMethod, handleClose);
    } catch (err) {
      appAlert(`예약 처리 중 오류: ${(err as any)?.message || "알 수 없는 오류"}`);
      setOrdering(false);
    }
  };

  return (
    <>
      {discountAmount > 0 && (
        <div className="mx-4 mt-4">
          <div className="bg-gradient-to-r from-brand-50 to-purple-50 rounded-xl border border-brand-100 p-3">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-gray-600 flex items-center gap-1">
                <Icon name="Cart" size={10} className="text-brand-500" />묶음 예약 할인 ({cartDiscount!.rate}%)
              </span>
              <span className="text-brand-600 font-semibold">-{formatPrice(discountAmount)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 pt-4">
        <div className="bg-white rounded-xl border border-gray-100 p-3">
          <div className="flex gap-3">
            <Link href={`/products/${item.productId}`} className="flex-shrink-0">
              <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                <SafeImage src={item.thumbnail} alt={item.name} width={80} height={80} fallbackText="No Img" />
              </div>
            </Link>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 mb-0.5">{item.sellerName}</p>
              <div className="flex items-start gap-1">
                <p className="text-sm font-medium text-gray-900 truncate flex-1">{item.name}</p>
              </div>
              {item.variantName && (
                <p className="text-[11px] text-gray-400 mt-0.5">{item.variantName}</p>
              )}
              <div className="flex items-center gap-1.5 mt-1">
                <p className="text-sm font-bold text-gray-900">{formatPrice(item.price)}</p>
                {discountAmount > 0 && (
                  <span className="text-[9px] bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded-full font-medium">
                    묶음 예약 할인 {cartDiscount!.rate}%
                  </span>
                )}
              </div>
              <div className="flex items-center mt-2">
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    <Minus size={14} strokeWidth={1.5} />
                  </button>
                  <span className="text-sm font-medium w-6 text-center">{quantity}</span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="p-1.5 text-gray-400 hover:text-gray-600"
                  >
                    <Icon name="Plus" size={14} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4">
        <BookingContactForm value={contact} onChange={setContact} />
      </div>

      {/* SNS 계정 선택 (선택사항) */}
      <div className="px-4 mt-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-1.5">
            <Icon name="SnsFeed_icon" size={15} /> SNS 계정 <span className="text-xs font-normal text-gray-400">(선택사항)</span>
          </h3>
          <p className="text-[11px] text-gray-500 mb-3">구매 인증에 사용할 SNS 계정을 입력해 주세요</p>

          {/* 플랫폼 선택 */}
          <div className="flex flex-wrap gap-3 mb-3">
            {["YouTube", "Instagram", "TikTok", "Facebook"].map((platform) => (
              <label key={platform} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedPlatforms.includes(platform)}
                  onChange={() => togglePlatform(platform)}
                  className="rounded border-gray-300 text-brand-500 focus:ring-brand-400"
                />
                <span className="text-xs text-gray-600">{platform}</span>
              </label>
            ))}
          </div>

          {/* 선택된 플랫폼별 입력 */}
          {selectedPlatforms.map((platform) => (
            <div key={platform} className="mb-2">
              <input
                type="text"
                placeholder={`${platform} 계정 아이디 또는 대화명`}
                value={snsHandles[platform] || ""}
                onChange={(e) => setSnsHandles((prev) => ({ ...prev, [platform]: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
            </div>
          ))}
        </div>
      </div>

      {/* 쿠폰 입력 */}
      <div className="px-4 mt-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
            <Icon name="Coupon" size={15} className="text-brand-500" /> 쿠폰
            <span className="text-[11px] font-normal text-gray-400">라이브·게임 당첨 쿠폰</span>
          </h3>
          {appliedCouponCode ? (
            <div className="flex items-center gap-2 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2.5">
              <Icon name="Check" size={15} className="text-brand-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-brand-700">{appliedCouponCode}</p>
                <p className="text-[11px] text-brand-500">-{formatPrice(couponDiscountAmount)} 할인 적용</p>
              </div>
              <button onClick={handleRemoveCoupon} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={couponInput}
                  onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null); }}
                  onKeyDown={e => e.key === "Enter" && handleApplyCoupon()}
                  placeholder="쿠폰 코드를 입력해주세요"
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
                <button
                  onClick={handleApplyCoupon}
                  disabled={couponLoading || !couponInput.trim()}
                  className="px-4 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 disabled:opacity-50 flex-shrink-0"
                >
                  {couponLoading ? "확인 중..." : "적용"}
                </button>
              </div>
              {couponError && (
                <p className="text-[11px] text-red-500">{couponError}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 mt-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5"><Icon name="CreditCard_icon" size={15} /> 결제 수단</h3>
          <div className="grid grid-cols-3 gap-2">
            {PAY_METHODS.map((m) => {
              const Icon = m.icon;
              const selected = payMethod === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => {
                    // 간편결제는 준비 중 — 선택하지 않고 안내 팝업만 노출
                    if (m.value === "EASYPAY") {
                      appAlert("간편결제는 현재 준비 중입니다.\n다른 결제 수단을 이용해 주세요.");
                      return;
                    }
                    setPayMethod(m.value);
                  }}
                  className={`flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-lg border transition ${
                    selected
                      ? "border-brand-500 bg-brand-50 text-brand-600"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <Icon size={20} strokeWidth={1.5} />
                  <span className="text-xs font-medium">{m.label}</span>
                  <span className="text-[10px] text-gray-400">{m.description}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="px-4 mt-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5"><Icon name="Receipt_icon" size={15} /> 결제 요약</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">상담상품 금액</span>
              <span className="font-medium">{formatPrice(totalPrice)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-brand-600 flex items-center gap-1"><Icon name="Tag" size={12} />할인</span>
                <span className="font-medium text-brand-600">-{formatPrice(discountAmount)}</span>
              </div>
            )}
            {couponDiscountAmount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-brand-600 flex items-center gap-1"><Icon name="Coupon" size={12} />쿠폰 할인</span>
                <span className="font-medium text-brand-600">-{formatPrice(couponDiscountAmount)}</span>
              </div>
            )}
            {cartDiscount && !cartDiscountEligible && (
              <p className="text-[10px] text-gray-400">
                {formatPrice(cartDiscount.threshold - totalPrice)} 더 예약하면 {cartDiscount.rate}% 묶음 예약 할인
              </p>
            )}
            <div className="border-t border-gray-100 pt-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900">총 결제금액</span>
                <div className="text-right">
                  {(discountAmount > 0 || couponDiscountAmount > 0) && (
                    <p className="text-[10px] text-gray-400 line-through">{formatPrice(totalPrice)}</p>
                  )}
                  <span className="text-lg font-bold text-brand-600">{formatPrice(finalTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 pb-4">
        <button
          onClick={handleOrder}
          disabled={ordering || !payMethod}
          className="btn-primary w-full py-4 text-base disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {ordering ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              결제창 호출 중...
            </span>
          ) : !payMethod ? (
            <>결제 수단을 선택해주세요</>
          ) : (
            <><Icon name="Cart" size={18} strokeWidth={1.5} className="mr-2" />{formatPrice(finalTotal)} 결제하기</>
          )}
        </button>
      </div>
    </>
  
  );
}
