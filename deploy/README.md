# jinhaoke — Ubuntu 部署

## 一鍵安裝

```bash
git clone https://github.com/Chuannnn1/jinhaoke.git
cd jinhaoke
sudo ./deploy/install-ubuntu.sh
```

或從遠端：

```bash
curl -fsSL https://raw.githubusercontent.com/Chuannnn1/jinhaoke/main/deploy/install-ubuntu.sh | sudo bash
```

## 安裝步驟（script 自動完成）

| # | 動作 | 備註 |
|---|---|---|
| 1 | `apt install build-essential python3 sqlite3` | better-sqlite3 native build |
| 2 | NodeSource → Node 22 LTS | 已存在則跳過 |
| 3 | Tailscale official installer | 已存在則跳過 |
| 4 | 建 `jinhaoke` system user + `/opt/jinhaoke` + `/var/lib/jinhaoke` | DB 不放 repo 內 |
| 5 | git clone / pull `/opt/jinhaoke` | idempotent |
| 6 | `ln -s /var/lib/jinhaoke /opt/jinhaoke/data` | DB 分離 |
| 7 | `npm ci && npm run build && npm run db:init` | seed 只在 DB 不存在時跑 |
| 8 | systemd unit `jinhaoke.service` | 自動 restart，boot 起動 |
| 9 | `tailscale up --ssh`（互動：印登入 URL） | 第一次要 sudo + 開瀏覽器授權 |
| 10 | `tailscale serve --https=443 http://localhost:3000` | HTTPS proxy 到 Next.js |

## 結果

- 本機：`http://localhost:3000`
- Tailnet：`https://<hostname>.<your-tailnet>.ts.net`（含 HTTPS、cert 自動）
- SSH：`tailscale ssh jinhaoke@<host>` 從任何 tailnet 裝置連入

## 常用指令

```bash
# 看 log
sudo journalctl -u jinhaoke -f

# 重啟
sudo systemctl restart jinhaoke

# 更新（pull 最新 + rebuild）
cd /opt/jinhaoke
sudo -u jinhaoke git pull
sudo -u jinhaoke npm ci
sudo -u jinhaoke npm run build
sudo -u jinhaoke npm run db:migrate
sudo systemctl restart jinhaoke

# Tailscale 狀態
tailscale status
tailscale serve status
```

## 防火牆

預設 `ufw` 沒啟用。若要開：

```bash
sudo ufw default deny incoming
sudo ufw allow in on tailscale0  # tailnet 流量
sudo ufw allow OpenSSH           # 本機 SSH
sudo ufw enable
```

注意：因為 Tailscale 是 user-space TUN，`ufw allow in on tailscale0` 就足夠擋掉外網直連 3000。

## Funnel（公開 HTTPS，可選）

若要從非 tailnet 裝置（路人手機）也能連：

```bash
sudo tailscale funnel --bg 443
```

需在 admin console 開 Funnel 權限。安全考量：會把 jinhaoke 暴露在公網，請先加認證（目前 admin 頁無 auth，建議加 basic auth 或 OAuth proxy）。

## 升級流程

```bash
# 程式碼
cd /opt/jinhaoke
sudo -u jinhaoke git pull
sudo -u jinhaoke npm ci
sudo -u jinhaoke npm run build
sudo systemctl restart jinhaoke

# Schema 變更
sudo -u jinhaoke npm run db:migrate
```

## 卸載

```bash
sudo systemctl stop jinhaoke
sudo systemctl disable jinhaoke
sudo rm /etc/systemd/system/jinhaoke.service
sudo systemctl daemon-reload
sudo rm -rf /opt/jinhaoke
# DB 保留在 /var/lib/jinhaoke，需手動 rm
sudo tailscale down
```
