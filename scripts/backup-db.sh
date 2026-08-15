#!/usr/bin/env bash
# 사주메이트 운영 DB 백업 스크립트 (mysqldump 논리 백업).
#
# - app/.env 의 DATABASE_URL 을 파싱해서 mysqldump 실행
# - 결과를 gzip 압축하여 REPO_DIR/backups/ 에 타임스탬프 파일로 저장
# - RETENTION_DAYS(기본 14일) 보다 오래된 백업은 자동 삭제
# - 읽기 전용(--single-transaction) 이므로 운영 데이터에 영향 없음
#
# 사용:
#   bash scripts/backup-db.sh
#
# 환경변수(선택):
#   REPO_DIR         기본: 이 스크립트의 상위 디렉토리
#   BACKUP_DIR       기본: $REPO_DIR/backups
#   RETENTION_DAYS   기본: 14
#   ENV_FILE         기본: $REPO_DIR/app/.env

if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

# ── 경로 결정 ─────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/app/.env}"

log() { printf '[backup-db] %s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
err() { printf '[backup-db] %s ERROR: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; }

# ── 사전 점검 ─────────────────────────────────────────────
if ! command -v mysqldump >/dev/null 2>&1; then
  err "mysqldump 미설치. 설치: sudo apt-get update && sudo apt-get install -y mysql-client"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  err ".env 파일 없음: $ENV_FILE"
  exit 1
fi

# ── DATABASE_URL 파싱 ─────────────────────────────────────
# .env 에서 DATABASE_URL 한 줄만 추출 (따옴표 제거)
DATABASE_URL="$(grep -E '^[[:space:]]*DATABASE_URL[[:space:]]*=' "$ENV_FILE" \
  | head -n1 | sed -E 's/^[^=]*=//; s/^["'"'"']//; s/["'"'"']$//')"

if [ -z "${DATABASE_URL:-}" ]; then
  err "DATABASE_URL 을 $ENV_FILE 에서 찾지 못함"
  exit 1
fi

# mysql://user:pass@host[:port]/db?params 형태 파싱.
# 호스트명에는 '@' 가 없으므로 '마지막 @' 기준으로 자른다(암호에 @ 가 있어도 안전).
url_no_scheme="${DATABASE_URL#mysql://}"
creds="${url_no_scheme%@*}"          # user:pass
rest="${url_no_scheme##*@}"          # host[:port]/db?params

DB_USER="${creds%%:*}"
DB_PASS="${creds#*:}"

host_port="${rest%%/*}"              # host[:port]
db_and_params="${rest#*/}"          # db?params
DB_NAME="${db_and_params%%\?*}"     # db

DB_HOST="${host_port%%:*}"
if [ "$host_port" = "$DB_HOST" ]; then
  DB_PORT=3306
else
  DB_PORT="${host_port#*:}"
fi

if [ -z "$DB_USER" ] || [ -z "$DB_HOST" ] || [ -z "$DB_NAME" ]; then
  err "DATABASE_URL 파싱 실패 (user/host/db 확인)"
  exit 1
fi

# ── 백업 실행 ─────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
TS="$(date '+%Y%m%d-%H%M%S')"
OUT="$BACKUP_DIR/sellerbricks-$TS.sql.gz"

# 암호를 커맨드라인(ps 노출)에 두지 않기 위해 임시 defaults-file 사용.
CNF="$(mktemp)"
chmod 600 "$CNF"
cleanup() { rm -f "$CNF"; }
trap cleanup EXIT

cat > "$CNF" <<EOF
[client]
user=$DB_USER
password=$DB_PASS
host=$DB_HOST
port=$DB_PORT
EOF

log "백업 시작: $DB_HOST:$DB_PORT / $DB_NAME → $OUT"

# RDS 운영 DB 대상 안전 옵션:
#   --single-transaction : InnoDB 일관 스냅샷(잠금 없이). 운영 트래픽 영향 최소화
#   --quick              : 행을 스트리밍 (대용량 메모리 사용 방지)
#   --no-tablespaces     : RDS 마스터 계정에 없는 PROCESS 권한 요구 회피
#   --set-gtid-purged=OFF: 복원 시 GTID 관련 오류 방지
#   --routines --triggers: 저장 프로시저/트리거 포함
#   --column-statistics=0: 8.0 클라이언트가 서버의 COLUMN_STATISTICS 조회 시도(1109 오류) 방지
set +e
mysqldump \
  --defaults-extra-file="$CNF" \
  --single-transaction \
  --quick \
  --no-tablespaces \
  --set-gtid-purged=OFF \
  --column-statistics=0 \
  --routines \
  --triggers \
  --default-character-set=utf8mb4 \
  "$DB_NAME" 2>"$BACKUP_DIR/.last-error.log" | gzip -c > "$OUT"
rc=${PIPESTATUS[0]}
set -e

if [ "$rc" -ne 0 ]; then
  err "mysqldump 실패 (exit $rc). 세부: $BACKUP_DIR/.last-error.log"
  cat "$BACKUP_DIR/.last-error.log" >&2 || true
  rm -f "$OUT"
  exit 1
fi

# 결과 검증: 파일이 존재하고 최소 크기 이상인지
SIZE=$(wc -c < "$OUT")
if [ "$SIZE" -lt 1024 ]; then
  err "백업 파일이 비정상적으로 작음 (${SIZE} bytes). 삭제 후 실패 처리."
  rm -f "$OUT"
  exit 1
fi

log "백업 완료: $OUT ($(du -h "$OUT" | cut -f1))"

# ── 오래된 백업 정리 ──────────────────────────────────────
if [ "$RETENTION_DAYS" -gt 0 ]; then
  DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'sellerbricks-*.sql.gz' -mtime "+$RETENTION_DAYS" -print -delete | wc -l)
  log "보존기간(${RETENTION_DAYS}일) 초과 백업 $DELETED 개 삭제"
fi

log "=== 완료 ==="
