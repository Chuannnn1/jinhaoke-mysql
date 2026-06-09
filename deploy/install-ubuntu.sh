#!/usr/bin/env bash
# ============================================================
# jinhaoke — Ubuntu one-shot installer
# 用法：
#   curl -fsSL https://raw.githubusercontent.com/Chuannnn1/jinhaoke/main/deploy/install-ubuntu.sh | sudo bash
#   或：git clone ... && cd jinhaoke && sudo ./deploy/install-ubuntu.sh
# 需要：Ubuntu 22.04 / 24.04，sudo 權限
# ============================================================
set -euo pipefail

# ── 參數 ─────────────────────────────────────
APP_USER="jinhaoke"
APP_DIR="/opt/jinhaoke"
DATA_DIR="/var/lib/jinhaoke"
REPO_URL="${REPO_URL:-https://github.com/Chuannnn1/jinhaoke.git}"
NODE_MAJOR=22
APP_PORT=3100  # 對齊 package.json 的 next start -p 3100

log() { echo -e "\033[1;36m[install]\033[0m $*"; }
err() { echo -e "\033[1;31m[error]\033[0m $*" >&2; exit 1; }

[ "$EUID" -eq 0 ] || err "必須用 sudo 執行"

# ── 1. 系統套件 ──────────────────────────────
log "更新 apt + 安裝 build deps"
apt-get update -qq
apt-get install -y -qq \
  curl ca-certificates git build-essential python3 \
  sqlite3 ufw

# ── 2. Node.js (NodeSource) ──────────────────
if ! command -v node >/dev/null || [ "$(node -v | grep -oP '(?<=v)\d+')" -lt "$NODE_MAJOR" ]; then
  log "安裝 Node.js $NODE_MAJOR"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
else
  log "Node.js 已存在 ($(node -v))，跳過"
fi

# ── 3. Tailscale ─────────────────────────────
if ! command -v tailscale >/dev/null; then
  log "安裝 Tailscale"
  curl -fsSL https://tailscale.com/install.sh | sh
else
  log "Tailscale 已存在 ($(tailscale version | head -1))，跳過"
fi

# ── 4. 建立 app user + 目錄 ──────────────────
if ! id "$APP_USER" >/dev/null 2>&1; then
  log "建立 user $APP_USER"
  useradd --system --create-home --shell /bin/bash "$APP_USER"
fi

mkdir -p "$APP_DIR" "$DATA_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR"

# ── 5. Clone / pull repo ─────────────────────
if [ -d "$APP_DIR/.git" ]; then
  log "repo 已存在，pull latest"
  sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only
else
  log "clone repo"
  sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
fi

# ── 6. 將 DB 目錄符號連到 /var/lib ───────────
if [ ! -L "$APP_DIR/data" ]; then
  rm -rf "$APP_DIR/data"
  ln -s "$DATA_DIR" "$APP_DIR/data"
  chown -h "$APP_USER:$APP_USER" "$APP_DIR/data"
fi

# ── 7. npm install + build + db:init ─────────
log "npm ci + build"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && npm ci"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && npm run build"

if [ ! -f "$DATA_DIR/jinhaoke.db" ]; then
  log "初始化 DB + seed"
  sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && npm run db:init"
else
  log "DB 已存在，跑 migration（idempotent）"
  sudo -u "$APP_USER" bash -c "cd '$APP_DIR' && npm run db:migrate || true"
fi

# ── 8. systemd service ───────────────────────
log "寫 systemd unit"
cat > /etc/systemd/system/jinhaoke.service <<UNIT
[Unit]
Description=jinhaoke POS (Next.js)
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=$APP_PORT
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

# ── 9. Tailscale up（互動）───────────────────
if ! tailscale status >/dev/null 2>&1; then
  log "啟動 Tailscale — 會印一個登入 URL，請點開授權後再跑 tailscale serve"
  tailscale up --ssh
fi

# ── 10. Tailscale Serve（HTTPS proxy）────────
# 把 https://<hostname>.<tailnet>.ts.net/ → http://localhost:3000
if tailscale serve status >/dev/null 2>&1; then
  log "設定 Tailscale Serve"
  tailscale serve --bg --https=443 "http://localhost:$APP_PORT" || true
fi

log "完成。"
log "本機驗證：curl http://localhost:$APP_PORT/api/menu | head -c 200"
log "Tailnet：https://\$(tailscale status --self --json | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d[\"Self\"][\"DNSName\"].rstrip(\".\"))')/"
log "journalctl -u jinhaoke -f 看 log"
