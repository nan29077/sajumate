#!/usr/bin/env bash
# 사주메이트 DB 백업을 매일 자정(한국시간)에 실행하도록 crontab 에 등록.
#
# - CRON_TZ=Asia/Seoul 로 서버 타임존(보통 UTC)과 무관하게 KST 00:00 실행
# - 마커 주석으로 기존 등록을 찾아 교체하므로 여러 번 실행해도 중복되지 않음(멱등)
#
# 사용:
#   bash scripts/setup-backup-cron.sh
#
# 환경변수(선택):
#   REPO_DIR   기본: 이 스크립트의 상위 디렉토리

if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
BACKUP_SCRIPT="$REPO_DIR/scripts/backup-db.sh"
LOG_FILE="$REPO_DIR/backups/backup.log"
MARKER="# sellerbricks-db-backup"

log() { printf '[setup-cron] %s\n' "$*"; }

if [ ! -f "$BACKUP_SCRIPT" ]; then
  echo "[setup-cron] ERROR: 백업 스크립트 없음: $BACKUP_SCRIPT" >&2
  exit 1
fi

chmod +x "$BACKUP_SCRIPT"
mkdir -p "$REPO_DIR/backups"

# cron 서비스 동작 확인 (경고만)
if command -v systemctl >/dev/null 2>&1; then
  if ! systemctl is-active --quiet cron 2>/dev/null; then
    log "경고: cron 서비스가 비활성 상태일 수 있음. 활성화: sudo systemctl enable --now cron"
  fi
fi

# 등록할 크론 라인 (KST 00:00 = 매일 자정)
CRON_TZ_LINE="CRON_TZ=Asia/Seoul ${MARKER}"
CRON_JOB_LINE="0 0 * * * bash ${BACKUP_SCRIPT} >> ${LOG_FILE} 2>&1 ${MARKER}"

# 기존 마커 라인 제거 후 새로 추가 (멱등)
CURRENT="$(crontab -l 2>/dev/null || true)"
CLEANED="$(printf '%s\n' "$CURRENT" | grep -vF "$MARKER" || true)"

{
  printf '%s\n' "$CLEANED" | sed '/^$/d'
  printf '%s\n' "$CRON_TZ_LINE"
  printf '%s\n' "$CRON_JOB_LINE"
} | crontab -

log "crontab 등록 완료:"
crontab -l | grep -F "$MARKER" || true
log ""
log "다음 실행: 매일 00:00 (Asia/Seoul)"
log "로그 확인:  tail -f $LOG_FILE"
log "즉시 테스트: bash $BACKUP_SCRIPT"
