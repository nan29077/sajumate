# 사주메이트 (SajuMate)

상담사(사주·타로·운세)와 고객을 잇는 라이브 연동 예약·상담 플랫폼

> 코드베이스 원본명은 `sellerbricks` 입니다. 라이브커머스 마켓플레이스에서 사주 상담 예약 플랫폼으로 피벗했으며, 운영 서버 경로·PM2 프로세스명·DB명·백업 파일 등 **인프라 식별자에는 아직 `sellerbricks` 이름이 남아 있습니다**(변경 시 배포·백업이 깨지므로 의도적으로 유지).

## 기술 스택

| 분류 | 기술 |
|------|------|
| Framework | Next.js 14 (App Router, Server Components) |
| DB | MySQL + Prisma 5 ORM |
| Auth | NextAuth.js v5 (JWT, credentials) |
| Styling | Tailwind CSS 3 + lucide-react |
| Forms | react-hook-form + zod |

## 시작하기

### 1. 사전 준비

- Node.js 18+
- MySQL 서버

### 2. 환경변수 설정

```bash
cd app
cp .env.example .env
```

`.env` 파일을 열어 본인 환경에 맞게 수정:

```env
# DB명 sellerbricks 는 운영 인프라 명칭입니다(로컬은 자유롭게 변경 가능).
DATABASE_URL="mysql://user:password@localhost:3306/sellerbricks"
AUTH_SECRET="your-secret-key"
AUTH_URL="http://localhost:3000"
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="사주메이트"
```

### 3. 설치 및 실행

```bash
cd app
npm install              # 의존성 설치
npx prisma generate      # Prisma Client 생성
npx prisma db push       # DB 스키마 반영
npm run db:seed          # 시드 데이터 투입 (선택)
npm run dev              # 개발 서버 실행 → http://localhost:3000
```

## 주요 명령어

```bash
# 모든 명령어는 app/ 디렉토리에서 실행
npm run dev              # 개발 서버
npm run build            # 프로덕션 빌드
npm run start            # 프로덕션 서버
npm run lint             # ESLint 검사
npm run format           # Prettier 포맷팅
npx tsc --noEmit         # 타입 체크

# DB 관련
npx prisma db push       # 스키마 → DB 반영 (마이그레이션 없이)
npx prisma migrate dev   # 마이그레이션 생성 및 적용
npx prisma generate      # Prisma Client 재생성
npx prisma studio        # DB GUI (브라우저)
npm run db:seed          # 시드 데이터 투입
```

## 프로젝트 구조

```
app/
├── src/
│   ├── app/
│   │   ├── (public)/          # 고객 & 비회원 (모바일 퍼스트)
│   │   │   ├── /              # 홈
│   │   │   ├── /products/*    # 상담상품
│   │   │   ├── /content/*     # 콘텐츠
│   │   │   ├── /shop/*        # 점집 (상담사 샵)
│   │   │   └── /my/*          # 마이페이지
│   │   ├── (dashboard)/       # 관리 대시보드 (사이드바 레이아웃)
│   │   │   ├── /admin/*       # 최고관리자
│   │   │   └── /seller/*      # 상담사 관리
│   │   ├── (live-viewer)/     # 라이브 상담 뷰어
│   │   └── api/               # API 라우트
│   ├── components/
│   │   ├── shared/            # 공용 컴포넌트
│   │   ├── admin/             # 관리자 컴포넌트
│   │   └── layout/            # 레이아웃 (Header, Footer, MobileNav)
│   └── lib/                   # 유틸리티, DB 클라이언트
├── prisma/
│   └── schema.prisma          # DB 스키마
└── package.json
```

## 역할 시스템

앱 코드는 아래 3개 역할로만 분기합니다.

| 역할 | 설명 |
|------|------|
| `SUPER_ADMIN` | 전체 관리 (사용자, 상담상품 승인, 정산) |
| `CONSULTANT` | 점집(샵) 운영, 상담상품·라이브·예약 관리, 단골 고객 관리 |
| `CUSTOMER` | 예약·결제, 리뷰, 위시리스트, 상담사 팔로우 |

> DB 에는 셀러브릭스 시절 레거시 enum(`SELLER`/`BUYER`/`BRAND_ADMIN`/`NODE`/`MIDDLE_ADMIN`)이 남아 있으나, 세션 레이어(`lib/roles.ts` 의 `normalizeRole`)에서 위 3역할로 정규화됩니다.

## 비즈니스 흐름

```
상담사가 상담상품(예약 상품) 등록
  → 최고관리자 승인
    → 고객이 점집에서 예약·결제
      → (라이브 방송 중 실시간 예약 연동)
        → 상담 진행
```

## 테스트 계정

`npm run db:seed` 로 시드 데이터를 투입하면 아래 계정으로 로그인할 수 있습니다.
비밀번호는 전부 동일하게 `password123` 입니다.

| 역할 | 이메일 | 비밀번호 | 용도 |
|------|--------|----------|------|
| `SUPER_ADMIN` (최고관리자) | `admin@sajumate.com` | `password123` | 전체 관리 |
| `CONSULTANT` (상담사) | `consultant1@sajumate.com` | `password123` | 점집 운영 |
| `CUSTOMER` (고객) | `customer1@example.com` | `password123` | 예약·상담 |

> 운영/인증 환경에서는 노출하지 않도록 주의하세요. 로컬 개발·QA 전용입니다.
