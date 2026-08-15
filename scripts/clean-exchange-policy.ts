/**
 * 상품 description 에 섞여 있는 "교환·환불 규정" 텍스트 소급 삭제 (관리자용 데이터 정리)
 *
 * 사주메이트 Product 모델에는 별도 exchangePolicy/returnPolicy 필드가 없고,
 * 교환·환불 규정은 상품 `description` 필드 안에 텍스트로 섞여 저장돼 있다.
 * (표준 카드가 상세페이지에 항상 하드코딩으로 노출되므로 description 내 규정 텍스트는 불필요)
 *
 * 동작: description 에서 아래 정책 시작 마커가 처음 등장하는 위치부터 끝까지를 제거한다.
 *   - 마커 앞의 실제 상품 설명 본문은 보존한다.
 *   - 제거 후 남는 본문이 없으면 description 을 null 로 비운다.
 *
 * 사용법:
 *   cd app
 *   npx tsx scripts/clean-exchange-policy.ts          # 드라이런(변경 없음)
 *   npx tsx scripts/clean-exchange-policy.ts --apply   # 실제 삭제
 */
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// 교환·환불 규정 텍스트의 시작을 알리는 마커들 (등장 위치 앞 본문은 보존)
const POLICY_MARKERS = [
  "📦 배송",
  "🔄 교환",
  "🔔[교환",
  "🔔 [교환",
  "⚠️ [교환",
  "⚠️[교환",
  "⚠️ 교환·반품이 불가",
  "[교환 및 환불 규정",
  "교환 및 환불 규정",
  "■ 교환·반품 및 환불",
  "교환·반품 및 환불",
  "📞 고객센터",
  "교환·환불",
];

function firstPolicyIndex(text: string): number {
  let best = -1;
  for (const m of POLICY_MARKERS) {
    const i = text.indexOf(m);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

async function main() {
  console.log(APPLY ? "=== 삭제 실행 모드 (--apply) ===" : "=== 드라이런 (변경 없음) ===");

  const products = await prisma.product.findMany({
    select: { id: true, name: true, description: true },
  });

  let changed = 0;
  for (const p of products) {
    const desc = p.description || "";
    const idx = firstPolicyIndex(desc);
    if (idx < 0) continue;

    const kept = desc.slice(0, idx).trim();
    const next = kept.length > 0 ? kept : null;
    if (next === (p.description ?? null)) continue;

    changed++;
    console.log(`- [정리] ${p.name} (${p.id}) → ${next === null ? "description 비움" : `본문 ${next.length}자 보존`}`);

    if (APPLY) {
      await prisma.product.update({
        where: { id: p.id },
        data: { description: next },
      });
    }
  }

  console.log(`\n정책 텍스트 제거 대상: ${changed}개 ${APPLY ? "처리 완료" : "(드라이런)"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
