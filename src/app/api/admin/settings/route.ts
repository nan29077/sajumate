import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getFeatureFlags,
  getSettlementBusinessDays,
  setSettings,
  SETTLEMENT_BUSINESS_DAYS_KEY,
  DEFAULT_SETTLEMENT_BUSINESS_DAYS,
} from "@/lib/settings";
import { FEATURE_SETTING_KEYS, type FeatureFlags } from "@/lib/featureFlags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: 현재 기능 토글 + 정산일 (최고관리자 전용)
export async function GET() {
  try {
    const session = await auth();
    if (!session || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }
    const [flags, settlementBusinessDays] = await Promise.all([
      getFeatureFlags(),
      getSettlementBusinessDays(),
    ]);
    return NextResponse.json({ flags, settlementBusinessDays });
  } catch (error: any) {
    return NextResponse.json({ error: "설정을 불러올 수 없습니다" }, { status: 500 });
  }
}

// PUT: 기능 토글 + 정산일 저장 (최고관리자 전용)
export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }

    const body = await req.json();
    const entries: Record<string, string> = {};

    // 기능 토글
    const flags: Partial<FeatureFlags> = body.flags ?? {};
    (Object.keys(FEATURE_SETTING_KEYS) as (keyof FeatureFlags)[]).forEach((k) => {
      if (typeof flags[k] === "boolean") {
        entries[FEATURE_SETTING_KEYS[k]] = flags[k] ? "true" : "false";
      }
    });

    // 정산일 (영업일 기준 N일 후) — 상담사/중간관리자/브랜드
    const dayFields: { bodyKey: string; settingKey: string }[] = [
      { bodyKey: "settlementBusinessDays", settingKey: SETTLEMENT_BUSINESS_DAYS_KEY },
    ];
    for (const f of dayFields) {
      if (body[f.bodyKey] !== undefined && body[f.bodyKey] !== null) {
        const n = parseInt(String(body[f.bodyKey]), 10);
        if (!Number.isFinite(n) || n < 0 || n > 60) {
          return NextResponse.json({ error: "정산일은 0~60 사이의 숫자여야 합니다" }, { status: 400 });
        }
        entries[f.settingKey] = String(n);
      }
    }

    if (Object.keys(entries).length > 0) {
      await setSettings(entries);
    }

    const [savedFlags, settlementBusinessDays] = await Promise.all([
      getFeatureFlags(),
      getSettlementBusinessDays(),
    ]);
    return NextResponse.json({
      flags: savedFlags,
      settlementBusinessDays,
      defaultSettlementBusinessDays: DEFAULT_SETTLEMENT_BUSINESS_DAYS,
    });
  } catch (error: any) {
    return NextResponse.json({ error: "설정 저장 실패" }, { status: 500 });
  }
}
