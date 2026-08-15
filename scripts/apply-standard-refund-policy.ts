/**
 * 표준 교환·환불 규정 소급 적용 스크립트 (관리자용 데이터 정리)
 *
 * 사주메이트에는 상품 단위의 별도 교환·환불 필드가 없고,
 * 기존에 입력된 교환·환불 규정은 상품 `description` 필드에 텍스트로 저장되어 있다.
 * (예: "⚠️ [교환 및 환불 규정] ...", "■ 교환·반품 및 환불 규정 안내 ...")
 *
 * 이 스크립트는 정책 문구가 포함된 상품의 description 을 표준 문구로 정규화한다.
 * (정책 시작 마커 앞의 상품 설명 본문은 보존한다.)
 *
 * ※ 상품 상세페이지에는 DB 값과 무관하게 항상 하드코딩 표준 카드가 노출된다.
 *   본 스크립트는 어디까지나 저장 데이터 정리 목적이다.
 *
 * 사용법:
 *   cd app
 *   npx tsx scripts/apply-standard-refund-policy.ts          # 드라이런(변경 없음)
 *   npx tsx scripts/apply-standard-refund-policy.ts --apply  # 실제 적용
 */
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// 하드코딩 표준 교환·환불 규정 (상세페이지 카드와 동일 내용)
const STANDARD_POLICY = `📦 배송
- 주문 후 1~3 영업일 이내 발송
- 제주/도서산간 추가 배송비 발생 가능

🔄 교환 및 반품
- 상품 수령 후 7일 이내 신청 가능
- 단순 변심: 왕복 배송비 고객 부담
- 상품 하자/오배송: 배송비 판매자 부담
- 교환/반품 불가: 사용·훼손·라벨 제거된 상품

⚠️ 교환·반품이 불가한 경우
- 고객 과실로 인한 상품 손상
- 포장 개봉 후 상품 가치 현저히 감소
- 시간 경과로 재판매 불가한 상품

📞 고객센터
- 카카오톡 채널: @셀러브릭스
- 운영시간: 평일 10:00~17:00 (점심 12:00~13:00)`;

// 정책 문구 시작 마커 (등장 위치 앞의 본문은 보존)
const POLICY_MARKERS = [
  "⚠️ [교환 및 환불 규정",
  "[교환 및 환불 규정",
  "교환 및 환불 규정",
  "■ 교환·반품 및 환불 규정",
  "교환·반품 및 환불 규정",
];

function findPolicyStart(text: string): number {
  let best = -1;
  for (const m of POLICY_MARKERS) {
    const idx = text.indexOf(m);
    if (idx >= 0 && (best < 0 || idx < best)) best = idx;
  }
  return best;
}

function hasPolicy(text: string): boolean {
  return (
    text.includes("교환 및 환불 규정") ||
    text.includes("교환·환불") ||
    text.includes("교환·반품 및 환불") ||
    /환불/.test(text)
  );
}

async function main() {
  console.log(APPLY ? "=== 적용 모드 (--apply) ===" : "=== 드라이런 (변경 없음) ===");

  const products = await prisma.product.findMany({
    select: { id: true, name: true, description: true },
  });

  let changed = 0;
  for (const p of products) {
    const desc = p.description || "";
    if (!desc || !hasPolicy(desc)) continue;

    const start = findPolicyStart(desc);
    const prefix = start > 0 ? desc.slice(0, start).trim() : "";
    const next = prefix ? `${prefix}\n\n${STANDARD_POLICY}` : STANDARD_POLICY;

    if (next === desc) continue;
    changed++;
    console.log(`- [정규화] ${p.name} (${p.id})`);

    if (APPLY) {
      await prisma.product.update({
        where: { id: p.id },
        data: { description: next },
      });
    }
  }

  console.log(`\n대상(정책 포함) 상품: ${changed}개 ${APPLY ? "업데이트 완료" : "(드라이런)"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
