import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getShopAwareLoginPath } from "@/lib/shopLoginRedirect";
import CartClient from "@/components/shared/CartClient";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const session = await auth();
  if (!session) redirect(getShopAwareLoginPath());

  const cartItems = await prisma.cartItem.findMany({
    where: { userId: session.user!.id, campaignId: null },
    include: {
      variant: {
        include: {
          product: {
            select: {
              name: true,
              thumbnail: true,
              basePrice: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Load product info separately for items without variants
  const productIds = cartItems.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      thumbnail: true,
      basePrice: true,
    },
  });
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  const items = cartItems.map((item) => {
    const product = item.variant?.product || productMap[item.productId];
    return {
      id: item.id,
      productId: item.productId,
      sellerId: item.sellerId,
      campaignId: null,
      name: product?.name || "상담상품",
      thumbnail: product?.thumbnail || null,
      variantId: item.variantId,
      variantName: item.variant?.name || null,
      price: Number(item.variant?.price || product?.basePrice || 0),
      quantity: item.quantity,
      isCampaign: false,
      shippingFee: 0,
      freeShipping: true,
      freeShippingThreshold: null,
    };
  });

  return (
    <div className="animate-fade-in pb-4">
      <CartClient initialItems={items} />
    </div>
  );
}
