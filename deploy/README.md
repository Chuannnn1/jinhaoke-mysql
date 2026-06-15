# jinhaoke — Ubuntu 部署

對 Azure VM 1C1G+ 設計。腳本同時處理 swap、Node 20、Tailscale、admin 密碼、systemd unit。

## 一鍵安裝

在你已準備好的 Ubuntu VM 上（例：`ssh NCYU`）：

```bash
ssh NCYU
sudo apt-get update -y && sudo apt-get install -y git
sudo git clone https://github.com/Chuannnn1/jinhaoke.git /tmp/jh
sudo /tmp/jh/deploy/install-ubuntu.sh
```

或從遠端直接拉腳本跑：

```bash
curl -fsSL https://raw.githubusercontent.com/Chuannnn1/jinhaoke/main/deploy/install-ubuntu.sh | sudo bash
```

## 腳本做什麼

| # | 動作 | 備註 |
|---|---|---|
| 0 | 加 swap +1G（RAM < 2GB 才會建立） | 防 `next build` OOM |
| 1 | `apt install build-essential python3 sqlite3 ufw` | better-sqlite3 native build 用 |
| 2 | NodeSource → Node 20 LTS | 已存在則跳過 |
| 3 | Tailscale 官方安裝腳本 | 已存在則跳過 |
| 4 | 建 `jinhaoke` system user + `/opt/jinhaoke` + `/var/lib/jinhaoke` | DB 不放 repo 內 |
| 5 | git clone / pull `/opt/jinhaoke` | idempotent |
| 6 | **互動讀後台密碼 → scrypt hash → `.env.production.local`**（mode 600） | 含 `DB_PATH`, `NODE_ENV`, `PORT`, `ADMIN_PASSWORD_HASH` |
| 7 | `npm ci && npm run build`；DB 首次 init / 既有 migrate | seed 只在 DB 不存在時跑 |
| 8 | systemd unit `jinhaoke.service` + `EnvironmentFile` 指 .env.production.local | 自動 restart |
| 9 | `tailscale up --ssh`（互動授權） | 印 URL 用瀏覽器/手機開 |
| 10 | 印 Tailnet IP + DNS + 完成提示 | |

## 結果

- 本機驗證：`curl http://localhost:3100/api/menu`
- Tailnet：`http://<tailscale-ip>:3100/` 或 `http://<hostname>.<tailnet>.ts.net:3100/`
- **顧客平板進 `/` 直接點餐；老闆手機進 `/admin` → 跳轉登入頁輸入密碼**

## 改後台密碼

```bash
cd /opt/jinhaoke
sudo -u jinhaoke node scripts/set-admin-password.js
sudo systemctl restart jinhaoke
```

## 強制所有 device 重新登入（撤銷 session）

```bash
sudo -u jinhaoke sqlite3 /var/lib/jinhaoke/jinhaoke.db "DELETE FROM admin_session"
```

## 常用指令

```bash
sudo journalctl -u jinhaoke -f                # 看 log
sudo systemctl restart jinhaoke               # 重啟
tailscale status                              # 看 tailnet 狀態
```

## 升級流程

```bash
cd /opt/jinhaoke
sudo -u jinhaoke git pull
sudo -u jinhaoke npm ci
sudo -u jinhaoke npm run build
sudo -u jinhaoke DB_PATH=/var/lib/jinhaoke/jinhaoke.db npm run db:migrate
sudo systemctl restart jinhaoke
```

## 防火牆（可選）

```bash
sudo ufw default deny incoming
sudo ufw allow in on tailscale0   # tailnet 流量
sudo ufw allow OpenSSH            # 本機 SSH
sudo ufw enable
```

Tailscale 是 user-space TUN，`ufw allow in on tailscale0` 就足以擋掉外網直連 3100。

## 卸載

```bash
sudo systemctl stop jinhaoke && sudo systemctl disable jinhaoke
sudo rm /etc/systemd/system/jinhaoke.service && sudo systemctl daemon-reload
sudo rm -rf /opt/jinhaoke
# DB 保留在 /var/lib/jinhaoke；要砍就 sudo rm -rf /var/lib/jinhaoke
sudo tailscale down
```
