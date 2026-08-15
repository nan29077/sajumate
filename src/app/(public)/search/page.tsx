import { Icon } from '@/components/shared/Icon';
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import SafeImage from "@/components/shared/SafeImage";
import WishlistButton from "@/components/shared/WishlistButton";
import ProductBadges from "@/components/shared/ProductBadges";
import { Search as SearchIcon } from 'lucide-react';

export const dynamic = "force-dynamic";

const STYLE_LABELS: Record<string, string> = {
  women: "여성",
  men: "남성",
  street: "스트릿",
  minimal: "미니멀",
  casual: "캐주얼",
  lovely: "러블리",
  vintage: "빈티지",
  chic: "시크",
  sporty: "스포티",
  luxury: "럭셔리",
  eco: "에코",
  kids: "키즈",
  tech: "테크",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; category?: string; style?: string; sort?: string };
}) {
  const { q, category, style, sort } = searchParams;

  // Build keyword filter combining q and style
  const keywords = [q, style && STYLE_LABELS[style]].filter(Boolean);

  const orderBy: any = sort === "price_asc" ? { basePrice: "asc" }
    : sort === "price_desc" ? { basePrice: "desc" }
    : sort === "newest" ? { createdAt: "desc" }
    : { soldCount: "desc" }; // default: popular

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      isApproved: true,
      ...(keywords.length > 0 && {
        OR: keywords.flatMap((kw) => [
          { name: { contains: kw! } },
          { description: { contains: kw! } },
        ]),
      }),
      ...(category && { category: { slug: category } }),
    },
    include: {
      category: true,
      sellerProducts: {
        include: { seller: { select: { shopName: true, slug: true } } },
        take: 1,
      },
    },
    orderBy,
    take: 40,
  });

  const title = style ? STYLE_LABELS[style] || style
    : category ? category
    : q ? `"${q}"`
    : "전체 상담상품";

  const sortOptions = [
    { value: "popular", label: "인기순" },
    { value: "newest", label: "최신순" },
    { value: "price_asc", label: "낮은가격순" },
    { value: "price_desc", label: "높은가격순" },
  ];

  const buildSortUrl = (s: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (style) params.set("style", style);
    params.set("sort", s);
    return `/search?${params.toString()}`;
  };

  return (
    <div className="min-h-screen bg-white animate-fade-in pb-20">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <Link href="/" className="p-1 -ml-1 text-gray-600 hover:text-gray-900">
            <Icon name="ChevronDown" size={22} strokeWidth={1.5} className="rotate-90" />
          </Link>
          <form className="flex-1" action="/search">
            <div className="relative">
              <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="상담상품명, 상담 분야 검색..."
                className="w-full text-sm pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-400"
              />
              {style && <input type="hidden" name="style" value={style} />}
              {category && <input type="hidden" name="category" value={category} />}
            </div>
          </form>
        </div>
      </div>

      {/* Filter / Sort Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50">
        <p className="text-xs text-gray-500">
          {title} <span className="text-gray-400">· {products.length}개</span>
        </p>
        <div className="flex items-center gap-1">
          {sortOptions.map((opt) => (
            <Link
              key={opt.value}
              href={buildSortUrl(opt.value)}
              className={`text-[11px] px-2 py-1 rounded-full transition-colors ${
                (sort || "popular") === opt.value
                  ? "bg-gray-900 text-white font-medium"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Product Grid */}
      <div className="px-4 pt-3">
        {products.length > 0 ? (
          <div className="grid grid-cols-2 gap-2.5">
            {products.map((product) => {
              const seller = product.sellerProducts[0]?.seller;
              const discount = product.comparePrice && Number(product.comparePrice) > Number(product.basePrice)
                ? Math.round((1 - Number(product.basePrice) / Number(product.comparePrice)) * 100)
                : 0;
              return (
                <div key={product.id} className="group bg-white rounded-lg overflow-hidden border border-gray-100 flex flex-col">
                  <div className="relative aspect-[3/4] overflow-hidden bg-gray-50">
                    <Link href={`/products/${product.id}`}>
                      <SafeImage
                        src={product.thumbnail}
                        alt={product.name}
                        width={300}
                        height={400}
                        fallbackText={product.name.charAt(0)}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </Link>
                    <WishlistButton productId={product.id} />
                    <ProductBadges badges={product.badges} className="absolute bottom-1.5 left-1.5" />
                    {discount > 0 && (
                      <span className="absolute top-1.5 left-1.5 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                        {discount}%
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 flex-1 flex flex-col">
                    <Link href={`/products/${product.id}`} className="flex-1">
                      {seller && <p className="text-[9px] text-gray-400 truncate">{seller.shopName}</p>}
                                            <h3 className="text-[12px] text-gray-800 line-clamp-2 leading-tight mt-0.5">{product.name}</h3>
                      <div className="flex items-baseline gap-1 mt-1.5">
                        {discount > 0 && <span className="text-xs font-bold text-red-500">{discount}%</span>}
                        <p className="text-[13px] font-bold text-gray-900">{formatPrice(Number(product.basePrice))}</p>
                      </div>
                      {discount > 0 && product.comparePrice && (
                        <p className="text-[10px] text-gray-400 line-through">{formatPrice(Number(product.comparePrice))}</p>
                      )}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-20 text-gray-400">
            <Icon name="Search" size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">검색 결과가 없습니다.</p>
            <p className="text-xs mt-1">다른 키워드로 검색해보세요</p>
          </div>
        )}
      </div>
    </div>
  );
}
