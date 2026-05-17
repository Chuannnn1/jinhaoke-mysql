# 環境建置教學（從零開始）

> 適用對象：所有組員  
> 更新日期：2026-05-17

---

## 目標

從零建立一個可跑的 Next.js 14 + SQLite POS 系統，最後 commit 進 `jinhaoke` repo。

---

## Step 1：確認環境

### Windows

1. **Node.js 20.x**  
   下載並安裝：https://nodejs.org/ (選 LTS 版本)  
   安裝完成後開 PowerShell，確認版本：

   ```powershell
   node -v
   # 應該顯示 v20.x.x

   npm -v
   # 應該顯示 10.x.x
   ```

2. **Git Bash（或 WSL）**  
   建議用 Git Bash 而非 CMD，語法與 Linux 相同。  
   下載：https://git-scm.com/download/win

3. **SQLite（可選，先不安裝也行）**  
   Windows 安裝比較麻煩，建議用 Linux/WSL 環境。  
   初期不需要自己 init 資料庫，程式會自動建立。

### Mac

```bash
# 用 Homebrew 安裝 Node.js 20.x
brew install node@20

# 確認版本
node -v   # v20.x.x
npm -v    # 10.x.x

# SQLite 通常已預裝，確認：
sqlite3 --version
```

---

## Step 2：建立 Next.js 專案

> 這裡「從零 init」的意思是：你自己用 `create-next-app` 建立專案框架，之後 commit 進 jinhaoke repo。組員 clone 後就有完整的起點。

```bash
# 進你想放專案的資料夾
cd ~/projects

# 建立 Next.js 14 專案（JavaScript + App Router）
npx create-next-app@latest jinhaoke \
  --javascript \
  --app \
  --no-tailwind \
  --no-src-dir \
  --import-alias "@/*" \
  --no-turbopack
```

> 如果問你要不要 TypeScript，選 **No**（我們用 JavaScript）  
> 如果問你要不要 ESLint / Prettier，可以選 Yes

進入專案：

```bash
cd jinhaoke
```

---

## Step 3：安裝必要依賴

```bash
# 1. better-sqlite3：SQLite 資料庫（.next 資料夾需要 rebuild）
npm install better-sqlite3

# 2. 確認 package.json 裡有這些 scripts
cat package.json
```

`package.json` 應該長這樣（確認 `"dev": "next dev"` 有設定 port 3100）：

```json
{
  "name": "jinhaoke",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3100",
    "build": "next build",
    "start": "next start -p 3100"
  },
  "dependencies": {
    "better-sqlite3": "^11.7.0",
    "next": "14.2.0",
    "react": "^18",
    "react-dom": "^18"
  }
}
```

> 如果 `better-sqlite3` 安裝失敗（Windows 常見），用管理員開 PowerShell 執行：
> ```powershell
> npm install --build-from-source better-sqlite3
> ```

---

## Step 4：建立資料庫初始化程式

### 4.1 建立資料夾結構

```
jinhaoke/
├── data/              ← 資料庫檔案放這（gitignore）
├── lib/
│   ├── db.ts         ← 資料庫連線
│   └── schema.sql    ← 資料庫結構定義
├── app/
│   └── api/          ← API routes（陸續新增）
└── public/
```

```bash
mkdir -p data lib
```

### 4.2 建立 `lib/db.ts`

```typescript
// lib/db.ts
import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'data', 'jinhaoker.db')

export function getDb() {
  return new Database(DB_PATH)
}
```

### 4.3 建立 `lib/schema.sql`

```sql
-- lib/schema.sql

-- 1. 菜單品項
CREATE TABLE IF NOT EXISTS menu_item (
  item_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  category        TEXT    NOT NULL,
  price           REAL    NOT NULL,
  description     TEXT    DEFAULT '',
  is_active       INTEGER DEFAULT 1,
  stock_qty       INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 10,
  sort_order      INTEGER DEFAULT 0,
  created_at      TEXT    DEFAULT (datetime('now', '+8 hours')),
  updated_at      TEXT    DEFAULT (datetime('now', '+8 hours'))
);

-- 2. 訂單
CREATE TABLE IF NOT EXISTS orders (
  order_id        TEXT    PRIMARY KEY,
  customer_name   TEXT,
  customer_phone   TEXT,
  status          TEXT    DEFAULT 'pending',
  note            TEXT    DEFAULT '',
  created_at      TEXT    DEFAULT (datetime('now', '+8 hours'))
);

-- 3. 訂單細項
CREATE TABLE IF NOT EXISTS order_item (
  order_id        TEXT,
  item_id         INTEGER,
  quantity        INTEGER,
  PRIMARY KEY (order_id, item_id)
);

-- 4. 庫存紀錄
CREATE TABLE IF NOT EXISTS inventory_log (
  log_id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id         INTEGER,
  change_qty      INTEGER,
  reason          TEXT,
  created_at      TEXT    DEFAULT (datetime('now', '+8 hours'))
);
```

### 4.4 初始化資料庫

```bash
# 第一次建立資料庫
mkdir -p data
sqlite3 data/jinhaoker.db < lib/schema.sql

# 驗證（有輸出 tables 就成功）
sqlite3 data/jinhaoker.db ".tables"
# → menu_item  orders  order_item  inventory_log
```

### 4.5 建立 `lib/seed.sql`（範例測試資料）

```sql
-- lib/seed.sql
INSERT INTO menu_item (name, category, price, stock_qty) VALUES
  ('牛肉麵', '主食', 120, 50),
  ('水餃', '主食', 80, 100),
  ('酸辣湯', '湯品', 50, 80),
  ('豆漿', '飲料', 25, 200),
  ('小菜一號', '小菜', 30, 60);
```

```bash
# 寫入範例資料
sqlite3 data/jinhaoker.db < lib/seed.sql

# 驗證
sqlite3 data/jinhaoker.db "SELECT name, price FROM menu_item;"
```

---

## Step 5：建立第一個 API

### 5.1 建立 `app/api/menu/route.ts`

```typescript
// app/api/menu/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// GET /api/menu — 查詢全部菜單
export async function GET() {
  try {
    const db = getDb()
    const menu = db.prepare(`
      SELECT * FROM menu_item WHERE is_active = 1 ORDER BY sort_order, item_id
    `).all()
    return NextResponse.json({ success: true, data: menu })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

// POST /api/menu — 新增品項
export async function POST(req: Request) {
  try {
    const { name, category, price } = await req.json()
    if (!name || !category || price === undefined) {
      return NextResponse.json(
        { success: false, error: 'name、category、price 為必填欄位' },
        { status: 400 }
      )
    }
    const db = getDb()
    const stmt = db.prepare(`
      INSERT INTO menu_item (name, category, price) VALUES (?, ?, ?)
    `)
    const result = stmt.run(name, category, price)
    const newItem = db.prepare('SELECT * FROM menu_item WHERE item_id = ?').get(result.lastInsertRowid)
    return NextResponse.json({ success: true, data: newItem }, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
```

### 5.2 啟動伺服器

```bash
npm run dev
# 看到以下訊息就成功：
#  ✓ Ready
#  - Local:        http://localhost:3100
```

### 5.3 測試 API

另開一個 terminal：

```bash
# GET — 查詢菜單
curl http://localhost:3100/api/menu

# POST — 新增品項
curl -X POST http://localhost:3100/api/menu \
  -H "Content-Type: application/json" \
  -d '{"name":"牛肉麵","category":"主食","price":120}'
```

---

## Step 6：.commit 到 GitHub

```bash
# 進 jinhaoke repo
cd jinhaoke

# 初始化 git（如尚未 init）
git init
git remote add origin git@github.com:Chuannnn1/jinhaoke.git

# .gitignore（建議忽略 data/*.db 和 .next）
echo "data/*.db" >> .gitignore
echo ".next" >> .gitignore
echo "node_modules" >> .gitignore

# commit
git add .
git commit -m "init: Next.js 14 + SQLite + menu API scaffold"

# 第一次 push（會失敗因為 remote 是空的，要用 -u）
git push -u origin main --force
```

---

## 最終資料夾結構（第一個 commit 之後）

```
jinhaoke/
├── app/
│   ├── api/
│   │   └── menu/
│   │       └── route.ts      ← 第一個 API
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── lib/
│   ├── db.ts                 ← 資料庫連線
│   ├── schema.sql            ← 9 張表的 DDL
│   └── seed.sql              ← 測試資料（可選）
├── data/                     ← gitignore，個人使用
├── public/
├── package.json
├── next.config.js
└── README.md
```

---

## 常見問題

| 問題 | 解法 |
|------|------|
| `better-sqlite3` 安裝失敗 | 用管理員權限開 PowerShell，執行 `npm install --build-from-source` |
| Port 3100 被佔用 | `netstat -ano \| findstr :3100` 找 PID後 `taskkill /PID <id> /F` |
| `sqlite3` command not found | Windows 用 Git Bash 或 WSL， Mac 通常已有 |
| `npm run dev` 沒反應 | 確認在專案資料夾內，檢查 `package.json` scripts |
| 錯誤 `Cannot find module '@/lib/db'` | 確認 `next.config.js` 的 `import-alias` 有設定 `"@/*"` |
| 資料庫被鎖住（locked） | 停止 `npm run dev`，重跑 |

---

## 下一個步驟（各組員領任務）

完成 init commit 之後，組員各自建立功能分支：

```bash
# 組員各自建立分支
git checkout -b feature/orders-api    # 組員2
git checkout -b feature/inventory-api # 組員3

# 開發完 commit 並 push
git add .
git commit -m "feat: add orders API"
git push origin feature/orders-api

# 然後在 GitHub 發 PR，等待 review
```