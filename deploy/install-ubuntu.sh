#!/usr/bin/env bash
# ============================================================
# jinhaoke — Ubuntu 一鍵安裝（Azure VM 22.04 / 24.04 LTS 1C1G+）
#
# 用法（推薦從本機 ssh 進 VM 後跑）：
#   ssh NCYU
#   sudo apt-get update -y && sudo apt-get install -y git
#   git clone https://github.com/Chuannnn1/jinhaoke.git /tmp/jh
#   sudo /tmp/jh/deploy/install-ubuntu.sh
#
# 環境變數覆寫：
#   REPO_URL=…    自訂 git url（預設 https://github.com/Chuannnn1/jinhaoke.git）
#   APP_PORT=…    Next.js 監聽 port（預設 3100，對齊 package.json）
#   ADMIN_PW=…    非互動模式直接帶密碼（CI 用；互動模式會 prompt）
#   TS_AUTHKEY=…  Tailscale auth key (tskey-…)；有設就自動連線，沒設則互動 URL
#   TS_SKIP=1     完全跳過 tailscale up（之後手動跑）
# ============================================================
set -euo pipefail

APP_USER="jinhaoke"
APP_DIR="/opt/jinhaoke"
DATA_DIR="/var/lib/jinhaoke"
REPO_URL="${REPO_URL:-https://github.com/Chuannnn1/jinhaoke.git}"
NODE_MAJOR=20
APP_PORT="${APP_PORT:-3100}"
SWAP_SIZE_MB=1024

log()  { echo -e "\033[1;36m[install]\033[0m $*"; }
warn() { echo -e "\033[1;33m[warn]\033[0m $*"; }
err()  { echo -e "\033[1;31m[error]\033[0m $*" >&2; exit 1; }

[ "$EUID" -eq 0 ] || err "必須用 sudo 執行（sudo $0）"

# ── 0. Swap（1C1G 防 npm run build OOM）──────────────
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
log "RAM = ${MEM_MB} MB"
if [ "$MEM_MB" -lt 2000 ] && [ ! -f /swapfile ]; then
  log "RAM < 2GB，建立 ${SWAP_SIZE_MB} MB swap 防 build OOM"
  fallocate -l ${SWAP_SIZE_MB}M /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
  log "swap 已存在或 RAM 充足，跳過"
fi

# ── 1. 系統套件 ──────────────────────────────────────
log "更新 apt + 安裝 build deps"
apt-get update -qq
apt-get install -y -qq \
  curl ca-certificates git build-essential python3 \
  sqlite3 ufw

# ── 2. Node.js (NodeSource) ─────────────────────────
NODE_CUR=$(node -v 2>/dev/null | grep -oP '(?<=v)\d+' || echo 0)
if [ "$NODE_CUR" -lt "$NODE_MAJOR" ]; then
  log "安裝 Node.js $NODE_MAJOR (目前 $NODE_CUR)"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
else
  log "Node.js 已就緒 ($(node -v))，跳過"
fi

# ── 3. Tailscale ────────────────────────────────────
if ! command -v tailscale >/dev/null; then
  log "安裝 Tailscale"
  curl -fsSL https://tailscale.com/install.sh | sh
else
  log "Tailscale 已存在 ($(tailscale version | head -1))，跳過"
fi

# ── 4. 建立 app user + 目錄 ─────────────────────────
if ! id "$APP_USER" >/dev/null 2>&1; then
  log "建立 system user $APP_USER"
  useradd --system --create-home --shell /bin/bash "$APP_USER"
fi

mkdir -p "$APP_DIR" "$DATA_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR"

# ── 5. Clone / pull repo ────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  log "repo 已存在，pull latest"
  sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only
else
  log "clone repo"
  sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
fi

# ── 6. 管理員密碼（互動）─────────────────────────────
ENV_FILE="$APP_DIR/.env.production.local"
EXISTING_HASH=""
if [ -f "$ENV_FILE" ]; then
  EXISTING_HASH=$(grep -E '^ADMIN_PASSWORD_HASH=' "$ENV_FILE" | head -1 | cut -d'=' -f2- || true)
fi

if [ -n "${ADMIN_PW:-}" ]; then
  ADMIN_PW_INPUT="$ADMIN_PW"
elif [ -n "$EXISTING_HASH" ]; then
  echo
  read -rp "$ENV_FILE 已有 ADMIN_PASSWORD_HASH。要重設嗎？[y/N] " -n 1 ans
  echo
  if [[ "$ans" =~ ^[Yy]$ ]]; then
    read -srp "新密碼: " ADMIN_PW_INPUT; echo
    read -srp "再輸入一次: " ADMIN_PW_CONFIRM; echo
    [ "$ADMIN_PW_INPUT" = "$ADMIN_PW_CONFIRM" ] || err "兩次輸入不一致"
  else
    ADMIN_PW_INPUT=""
  fi
else
  echo
  echo "設定後台登入密碼（至少 6 字；之後可重跑 set-admin-password.js 改）"
  read -srp "新密碼: " ADMIN_PW_INPUT; echo
  read -srp "再輸入一次: " ADMIN_PW_CONFIRM; echo
  [ "$ADMIN_PW_INPUT" = "$ADMIN_PW_CONFIRM" ] || err "兩次輸入不一致"
  [ ${#ADMIN_PW_INPUT} -ge 6 ] || err "密碼太短，至少 6 字"
fi

# 寫 .env.production.local
TMP_ENV=$(mktemp)
{
  if [ -f "$ENV_FILE" ]; then
    grep -vE '^(ADMIN_PASSWORD_HASH|DB_PATH|NODE_ENV|PORT)=' "$ENV_FILE" || true
  fi
  echo "NODE_ENV=production"
  echo "PORT=$APP_PORT"
  echo "DB_PATH=$DATA_DIR/jinhaoke.db"
  if [ -n "$ADMIN_PW_INPUT" ]; then
    NEW_HASH=$(NODE_INPUT="$ADMIN_PW_INPUT" node -e "
      const { randomBytes, scryptSync } = require('crypto');
      const salt = randomBytes(16).toString('hex');
      const hash = scryptSync(process.env.NODE_INPUT, salt, 64).toString('hex');
      console.log('scrypt:' + salt + ':' + hash);
    ")
    echo "ADMIN_PASSWORD_HASH=$NEW_HASH"
  elif [ -n "$EXISTING_HASH" ]; then
    echo "ADMIN_PASSWORD_HASH=$EXISTING_HASH"
  fi
} > "$TMP_ENV"
install -o "$APP_USER" -g "$APP_USER" -m 600 "$TMP_ENV" "$ENV_FILE"
rm -f "$TMP_ENV"
log "寫入 $ENV_FILE（mode 600）"

# ── 7. npm ci + build + db ─────────────────────────
log "npm ci + build（首次可能 5–8 分鐘）"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && npm ci"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && npm run build"

if [ ! -f "$DATA_DIR/jinhaoke.db" ]; then
  log "初始化 DB + seed"
  sudo -u "$APP_USER" DB_PATH="$DATA_DIR/jinhaoke.db" bash -c "cd '$APP_DIR' && npm run db:init"
else
  log "DB 已存在，跑 migration（idempotent）"
  sudo -u "$APP_USER" DB_PATH="$DATA_DIR/jinhaoke.db" bash -c "cd '$APP_DIR' && npm run db:migrate || true"
fi

# ── 8. systemd unit ─────────────────────────────────
log "寫 systemd unit"
cat > /etc/systemd/system/jinhaoke.service <<UNIT
[Unit]
Description=jinhaoke POS (Next.js)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable jinhaoke.service
systemctl restart jinhaoke.service

# ── 9. Tailscale up ─────────────────────────────────
if ! tailscale status >/dev/null 2>&1; then
  if [ "${TS_SKIP:-0}" = "1" ]; then
    warn "TS_SKIP=1，跳過 tailscale up（稍後手動跑：sudo tailscale up --ssh --accept-routes [--authkey=tskey-…]）"
  elif [ -n "${TS_AUTHKEY:-}" ]; then
    log "用 TS_AUTHKEY 自動連線"
    tailscale up --ssh --accept-routes --authkey="$TS_AUTHKEY"
  else
    echo
    log "啟動 Tailscale — 印出來的 URL 用瀏覽器/手機開來授權"
    tailscale up --ssh --accept-routes
  fi
fi

# ── 10. 顯示完成資訊 ────────────────────────────────
TS_DNS=$(tailscale status --self --json 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['Self']['DNSName'].rstrip('.'))" 2>/dev/null || echo "")
TS_IP=$(tailscale ip -4 2>/dev/null | head -1 || echo "")

echo
echo "============================================================"
log "安裝完成 🎉"
echo "  · 顧客平板 / 老闆手機（均需在 Tailnet 上）"
echo "    Tailscale IP   : http://$TS_IP:$APP_PORT/"
if [ -n "$TS_DNS" ]; then
  echo "    Tailscale DNS  : http://$TS_DNS:$APP_PORT/"
fi
echo
echo "  · 第一次進 /admin 會跳登入頁，輸入剛才設定的密碼"
echo "  · 改密碼：cd $APP_DIR && sudo -u $APP_USER node scripts/set-admin-password.js"
echo "  · log    : sudo journalctl -u jinhaoke -f"
echo "  · 重啟   : sudo systemctl restart jinhaoke"
echo "============================================================"
