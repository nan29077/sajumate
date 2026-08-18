import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// 강제 재설정 — 로그인된(임시 비밀번호) 사용자가 새 비밀번호를 설정한다.
// 현재 비밀번호 확인 없이(이미 세션 인증됨) 새 비밀번호로 교체하고 강제 재설정 플래그를 해제한다.
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { newPassword } = (await req.json()) as { newPassword?: string };
    // 회원가입(register)과 동일하게 8자 이상으로 통일
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { error: "새 비밀번호는 8자 이상이어야 합니다." },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { password: true },
    });
    if (!user?.password) {
      return NextResponse.json(
        { error: "소셜 로그인 계정은 비밀번호를 설정할 수 없습니다." },
        { status: 400 },
      );
    }

    // 임시 비밀번호와 동일한 값으로는 재설정 불가
    const isSame = await bcrypt.compare(newPassword, user.password);
    if (isSame) {
      return NextResponse.json(
        { error: "임시 비밀번호와 다른 새 비밀번호를 입력해주세요." },
        { status: 400 },
      );
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: session.user.id },
      data: { password: hashed, mustResetPassword: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[reset-password] error", error);
    return NextResponse.json(
      { error: "비밀번호 재설정에 실패했습니다." },
      { status: 500 },
    );
  }
}
