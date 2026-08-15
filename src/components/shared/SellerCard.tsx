import { Icon } from '@/components/shared/Icon';
import Link from "next/link";
import { sellerShopUrl } from "@/lib/utils";
import SafeImage from "@/components/shared/SafeImage";

interface SellerCardProps {
  seller: {
    slug: string;
    shopName: string;
    shopLogo: string | null;
    shopBanner: string | null;
    shopDescription?: string | null;
    category: string | null;
    mood: string | null;
    totalFans: number;
    _count?: {
      shopProducts?: number;
      fans?: number;
    };
  };
  variant?: "default" | "featured" | "compact";
}

export default function SellerCard({
  seller,
  variant = "default",
}: SellerCardProps) {

  if (variant === "featured") {
    return (
      <Link
        href={sellerShopUrl(seller.slug)}
        className="group block bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:border-brand-200 transition-all duration-300"
      >
        {/* Banner - fixed height, no overlap */}
        <div className="relative h-28 overflow-hidden bg-gradient-to-br from-brand-100 to-purple-100">
          {seller.shopBanner ? (
            <SafeImage
              src={seller.shopBanner}
              alt={seller.shopName}
              width={400}
              height={112}
              fallbackText={seller.shopName}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-brand-400/20 via-purple-300/20 to-pink-300/20" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
          {/* Category badge on banner */}
          {seller.category && (
            <span className="absolute top-2.5 right-2.5 text-[10px] font-medium text-white bg-black/30 backdrop-blur-sm px-2 py-0.5 rounded-full">
              {seller.category}
            </span>
          )}
        </div>

        {/* Content - clear separation, no negative margin overlap */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="w-12 h-12 rounded-xl border-2 border-gray-100 shadow-sm overflow-hidden bg-white flex-shrink-0 -mt-8 relative z-10">
              <SafeImage
                src={seller.shopLogo}
                alt={seller.shopName}
                width={48}
                height={48}
                fallbackText={seller.shopName.charAt(0)}
              />
            </div>
            {/* Name and mood - separate line, no overlap */}
            <div className="flex-1 min-w-0">
              <h3 className="text-[15px] font-bold text-gray-900 truncate leading-tight">
                {seller.shopName}
              </h3>
              {seller.mood && (
                <p className="text-[11px] text-gray-400 truncate mt-0.5">{seller.mood}</p>
              )}
            </div>
          </div>

          {/* Description - distinct area */}
          {seller.shopDescription && (
            <p className="text-xs text-gray-500 line-clamp-2 mt-2.5 leading-relaxed">
              {seller.shopDescription}
            </p>
          )}

          {/* Stats row - clear and separate */}
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
            <span className="flex items-center gap-1 text-[11px] text-gray-500">
              <Icon name="Users" size={12} strokeWidth={1.5} className="text-brand-400" />
              팬 {seller.totalFans.toLocaleString()}
            </span>
            {seller._count?.shopProducts !== undefined && seller._count.shopProducts > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-gray-500">
                <Icon name="Cart" size={12} strokeWidth={1.5} className="text-gray-400" />
                상담상품 {seller._count.shopProducts}
              </span>
            )}
          </div>
        </div>
      </Link>
    );
  }

  if (variant === "compact") {
    return (
      <Link
        href={sellerShopUrl(seller.slug)}
        className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
      >
        <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 border border-gray-100 bg-white">
          <SafeImage
            src={seller.shopLogo}
            alt={seller.shopName}
            width={44}
            height={44}
            fallbackText={seller.shopName.charAt(0)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{seller.shopName}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-gray-400">팬 {seller.totalFans.toLocaleString()}</span>
            {seller.category && (
              <span className="text-[10px] text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">
                {seller.category}
              </span>
            )}
          </div>
        </div>
        <Icon name="ChevronDown" size={16} strokeWidth={1.5} className="text-gray-300 flex-shrink-0 -rotate-90" />
      </Link>
    );
  }

  // default variant - clean card without overlapping
  return (
    <Link
      href={sellerShopUrl(seller.slug)}
      className="group block bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md hover:border-brand-200 transition-all duration-300"
    >
      {/* Banner */}
      <div className="relative h-24 overflow-hidden bg-gradient-to-br from-gray-100 to-gray-50">
        {seller.shopBanner ? (
          <SafeImage
            src={seller.shopBanner}
            alt={seller.shopName}
            width={400}
            height={96}
            fallbackText={seller.shopName}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-brand-400/10 via-purple-300/10 to-pink-300/10" />
        )}
      </div>

      {/* Content - no overlap */}
      <div className="px-4 pt-1 pb-4 text-center">
        <div className="w-12 h-12 rounded-xl mx-auto -mt-7 relative z-10 overflow-hidden border-2 border-white shadow-sm bg-white">
          <SafeImage
            src={seller.shopLogo}
            alt={seller.shopName}
            width={48}
            height={48}
            fallbackText={seller.shopName.charAt(0)}
          />
        </div>
        <h3 className="text-sm font-bold text-gray-900 mt-2 truncate px-2">{seller.shopName}</h3>
        {seller.mood && (
          <p className="text-[11px] text-gray-400 mt-0.5 truncate px-2">{seller.mood}</p>
        )}
        <div className="flex items-center justify-center gap-2.5 mt-2.5 text-[11px] text-gray-400">
          <span className="flex items-center gap-1">
            <Icon name="Users" size={11} strokeWidth={1.5} />
            {seller.totalFans.toLocaleString()}
          </span>
          {seller.category && (
            <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500 text-[10px]">
              {seller.category}
                     </span>
          )}
        </div>
      </div>
    </Link>
  );
}
