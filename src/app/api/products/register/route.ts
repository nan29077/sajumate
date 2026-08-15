import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isMissingSchemaError } from "@/lib/safeDb";

// 금액(배송비 등) 파싱: 음수/NaN은 기본값으로 보정
function toMoney(value: any, fallback = 0): number {
  const n = parseFloat(String(value));
  return isNaN(n) || n < 0 ? fallback : n;
}
// 임계금액: 비어있으면 null(무료배송 임계 미설정), 값이 있으면 음수 보정
function toMoneyOrNull(value: any): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = parseFloat(String(value));
  return isNaN(n) || n < 0 ? null : n;
}

// GET: Get categories for product registration form, or admin product list
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

    const role = session.user.role;
    if (role !== "SUPER_ADMIN" && role !== "CONSULTANT") {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode");

    // 관리자 상담상품 관리 모드 — 전체 상담상품 + 플래그
    if (mode === "admin-manage") {
      if (role !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "권한 없음" }, { status: 403 });
      }

      const where: any = { isActive: true };

      const products = await prisma.product.findMany({
        where,
        include: {
          category: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      });

      return NextResponse.json({
        products: products.map(p => ({
          id: p.id,
          name: p.name,
          thumbnail: p.thumbnail,
          basePrice: Number(p.basePrice),
          supplyPrice: p.supplyPrice != null ? Number(p.supplyPrice) : null,
          categoryName: p.category?.name || null,
          allowGroupBuy: p.allowGroupBuy,
          allowLiveCommerce: (p as any).allowLiveCommerce ?? false,
        })),
      });
    }

    // Default: return categories
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, slug: true, parentId: true },
    });

    return NextResponse.json({ categories });
  } catch (error) {
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

// POST: Register a new product (Admin/Brand/Seller) — optionally with group-buy campaign
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
    }

    const role = session.user.role;
    if (role !== "SUPER_ADMIN" && role !== "CONSULTANT") {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }

    const body = await req.json();
    const {
      name, description, basePrice, comparePrice, categoryId,
      thumbnail, detailContent, variants, images,
      isGroupBuy, badges,
      supplyPrice,
      priceModel, sellerCommissionRate,
      optionGroups,
      consultingType, consultingMethod, durationMinutes, maxDailySlots, allowLiveCommerce,
    } = body;

    if (!name || basePrice === undefined || basePrice === null || basePrice === "") {
      return NextResponse.json({ error: "상담상품명과 가격은 필수입니다" }, { status: 400 });
    }

    const parsedBasePrice = parseFloat(String(basePrice));
    if (isNaN(parsedBasePrice) || parsedBasePrice < 0) {
      return NextResponse.json({ error: "유효한 가격을 입력해주세요" }, { status: 400 });
    }

    if (isGroupBuy) {
      return NextResponse.json({ error: "공동구매 상품은 더 이상 등록할 수 없습니다." }, { status: 410 });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9가-힣]/g, "-").replace(/-+/g, "-") + "-" + Date.now().toString(36);

    const parsedSupplyPrice = toMoneyOrNull(supplyPrice);

    // 제공 방식: SUPPLY(공급가 제공) / COMMISSION(수수료 제공). 상담사 직접 등록은 항상 SUPPLY.
    const resolvedPriceModel: "SUPPLY" | "COMMISSION" =
      role !== "CONSULTANT" && priceModel === "COMMISSION" ? "COMMISSION" : "SUPPLY";
    // 수수료 제공 시: 상담사 수수료율(%)과 수수료 금액(판매가 × 수수료율)을 저장
    let resolvedCommissionRate: number | null = null;
    let resolvedSellerCommissionAmount: number | null = null;
    if (resolvedPriceModel === "COMMISSION") {
      resolvedCommissionRate = toMoneyOrNull(sellerCommissionRate);
      if (resolvedCommissionRate != null) {
        resolvedSellerCommissionAmount = Math.round(parsedBasePrice * resolvedCommissionRate / 100);
      }
    }

    // For sellers, get their seller profile
    let sellerProfile = null;
    if (role === "CONSULTANT") {
      sellerProfile = await prisma.sellerProfile.findUnique({
        where: { userId: session.user!.id },
      });
      if (!sellerProfile) {
        return NextResponse.json({ error: "상담사 프로필이 없습니다" }, { status: 400 });
      }
    }

    // 관리자/상담사 등록 상담상품은 자동 공개
    const isApproved = true;

    // Create product
    const productData = {
      name,
      slug,
      description: description || null,
      detailContent: detailContent || null,
      basePrice: parsedBasePrice,
      comparePrice: comparePrice ? parseFloat(String(comparePrice)) : null,
      supplyPrice: resolvedPriceModel === "COMMISSION" ? null : parsedSupplyPrice,
      // 제공 방식 (공급가 제공 / 수수료 제공)
      priceModel: resolvedPriceModel,
      commissionRate: resolvedCommissionRate,
      sellerCommissionAmount: resolvedSellerCommissionAmount,
      categoryId: categoryId || null,
      // 상담사 직접 등록 상담상품은 등록 상담사를 기록 → 다른 상담사의 '상담상품 신청' 목록에서 제외됨
      sellerId: role === "CONSULTANT" && sellerProfile ? sellerProfile.id : null,
      thumbnail: thumbnail || (images && images.length > 0 ? images[0] : null),
      isActive: true,
      isApproved,
      allowGroupBuy: false,
      allowLiveCommerce: Boolean(allowLiveCommerce),
      badges: badges && Array.isArray(badges) && badges.length > 0 ? JSON.stringify(badges) : null,
      ...((optionGroups && Array.isArray(optionGroups) && optionGroups.length > 0)
        ? { optionGroups: JSON.stringify(optionGroups) } as any
        : {}),
      ...(variants && Array.isArray(variants) && variants.length > 0 ? {
        variants: {
          create: variants.filter((v: any) => v.name).map((v: any, i: number) => ({
            name: v.name,
            price: parseFloat(String(v.price || basePrice)),
            sortOrder: i,
          })),
        },
      } : {}),
      ...(images && Array.isArray(images) && images.length > 0 ? {
        images: {
          create: images.filter(Boolean).map((url: string, i: number) => ({
            url,
            alt: `${name} 이미지 ${i + 1}`,
            sortOrder: i,
          })),
        },
      } : {}),
    };

    // ── 상담 상품 속성 ── 운영 DB에 아직 없는 컬럼(P2022)일 수 있어 실패 시 제외하고 재시도
    const consultingAttrs = {
      consultingType: consultingType ? String(consultingType) : "사주",
      consultingMethod: consultingMethod ? String(consultingMethod) : "영상통화",
      durationMinutes: Math.max(1, parseInt(String(durationMinutes ?? 30), 10) || 30),
      maxDailySlots: Math.max(1, parseInt(String(maxDailySlots ?? 5), 10) || 5),
    };

    let product;
    try {
      product = await prisma.product.create({ data: { ...productData, ...consultingAttrs } });
    } catch (e) {
      if (!isMissingSchemaError(e)) throw e;
      console.warn("[products/register] 상담 컬럼 미반영(P2022) — 상담 속성 제외 후 재시도");
      product = await prisma.product.create({ data: productData });
    }

    // If seller, also add to their shop products (active + 승인완료 → 즉시 판매중)
    // 이미 점집상담상품이 있으면 그대로 두고, 없으면 승인완료 상태로 생성(관리자 승인 불필요)
    if (role === "CONSULTANT" && sellerProfile) {
      await prisma.sellerShopProduct.upsert({
        where: {
          sellerId_productId: { sellerId: sellerProfile.id, productId: product.id },
        },
        update: {},
        create: {
          sellerId: sellerProfile.id,
          productId: product.id,
          isActive: true,
          isApproved: true, // 상담사 직접 등록 상담상품은 승인 대기 없이 즉시 판매
        },
      });
    }

    return NextResponse.json({ success: true, product });
  } catch (e: any) {
    // 원인 파악을 위한 상세 로깅 (Prisma 코드/메시지 포함)
    console.error("[products/register] 상담상품 등록 실패:", {
      code: e?.code,
      message: e?.message,
      meta: e?.meta,
    });
    return NextResponse.json(
      { error: "상담상품 등록 실패", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
