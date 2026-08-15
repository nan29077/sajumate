import BrandMark from "@/components/shared/BrandMark";

export default function BrandWordmark({
  size = "md",
  variant = "dark",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  variant?: "dark" | "light";
  className?: string;
}) {
  const textCls = size === "lg" ? "text-[22px]" : size === "sm" ? "text-[16px]" : "text-[19px]";
  const iconSize = size === "lg" ? 27 : size === "sm" ? 20 : 23;
  const markTone = variant === "light" ? "text-[#D9CDFF]" : "text-[#6846C7]";
  const sajuTone = variant === "light" ? "text-white" : "text-[#241445]";
  const mateTone = variant === "light" ? "text-[#D9CDFF]" : "text-[#805AD5]";

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} aria-label="사주메이트">
      <BrandMark size={iconSize} className={`flex-shrink-0 ${markTone}`} />
      <span className={`${textCls} font-extrabold tracking-[-0.045em] leading-none`} aria-hidden="true">
        <span className={sajuTone}>사주</span>
        <span className={mateTone}>메이트</span>
      </span>
    </span>
  );
}
