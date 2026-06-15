-- ============================================================
-- 金濠客食堂 POS 系統 — 資料庫 Schema v3
-- 更新日期：2026-05-22（對齊 PDF 2026/5/20 版）
-- 設計決策：
--   1. 食材/供應商 PK 用 name（非 ID）
--   2. 進貨單拆成主表 + 明細（2NF）
--   3. order_item 存餐點單價快照（漲價不影響歷史）
--   4. 庫存於出餐時扣除，非下單時
--   5. 新增叫貨單位（order_unit / qty_per_order_unit）
-- ============================================================

PRAGMA foreign_keys = ON;

-- ============================================================
-- (1) 供應商 supplier — PK 用 name
-- ============================================================
CREATE TABLE IF NOT EXISTS supplier (
    name        TEXT    PRIMARY KEY,           -- 供應商名稱
    phone       TEXT
);

-- ============================================================
-- (2) 食材 ingredient — PK 用 name（含叫貨單位設計）
-- ============================================================
CREATE TABLE IF NOT EXISTS ingredient (
    name                  TEXT    PRIMARY KEY,       -- 食材名稱（PK）
    stock_qty             REAL    NOT NULL DEFAULT 0,  -- 庫存數量（stock_unit 下的量）
    safety_stock          REAL    NOT NULL DEFAULT 0,  -- 安全存量（補貨警示點）
    stock_unit            TEXT    NOT NULL,            -- 庫存計量單位（片 / 隻 / kg）
    order_unit            TEXT    NOT NULL,            -- 叫貨單位（箱 / 包 / 盒）
    qty_per_order_unit    REAL    NOT NULL,            -- 每個叫貨單位 = 多少 stock_unit
    supplier_name         TEXT,                        -- FK → supplier.name
    order_block_threshold REAL    DEFAULT NULL,        -- 接單暫停點；NULL 時 fallback 為 safety_stock * 0.2
    FOREIGN KEY (supplier_name) REFERENCES supplier(name)
        ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ingredient_supplier ON ingredient(supplier_name);
CREATE INDEX IF NOT EXISTS idx_ingredient_low_stock ON ingredient(stock_qty);

-- ============================================================
-- (3) 餐點 menu_item
--   emoji  : 暫時顯示（未來替換成上傳照片）
--   tag    : 蛋白質分類（魚/豬/雞/牛/其他）— 前台篩選用
--   sub    : 副標說明（扁鱈/無骨/二片）
--   option : 加購說明（加肉60/加菜10）
-- ============================================================
CREATE TABLE IF NOT EXISTS menu_item (
    item_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL UNIQUE,
    category     TEXT,
    price        INTEGER NOT NULL,
    emoji        TEXT    NOT NULL DEFAULT '',
    tag          TEXT    NOT NULL DEFAULT '其他',
    sub          TEXT    NOT NULL DEFAULT '',
    option       TEXT    NOT NULL DEFAULT '',
    description  TEXT,
    is_active    INTEGER NOT NULL DEFAULT 1,
    image_url    TEXT    NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_menu_category ON menu_item(category);
CREATE INDEX IF NOT EXISTS idx_menu_active ON menu_item(is_active);
CREATE INDEX IF NOT EXISTS idx_menu_tag ON menu_item(tag);

-- ============================================================
-- (4) 食譜 recipe — 餐點 M:N 食材（配方）
-- ============================================================
CREATE TABLE IF NOT EXISTS recipe (
    item_id          INTEGER NOT NULL,
    ingredient_name  TEXT    NOT NULL,           -- FK → ingredient.name
    consume_qty      REAL    NOT NULL,           -- 每份餐點消耗多少（stock_unit）
    PRIMARY KEY (item_id, ingredient_name),
    FOREIGN KEY (item_id) REFERENCES menu_item(item_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (ingredient_name) REFERENCES ingredient(name)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_recipe_item ON recipe(item_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredient ON recipe(ingredient_name);

-- ============================================================
-- (5) 外送顧客單 delivery_customer
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_customer (
    phone        TEXT    PRIMARY KEY,            -- 顧客電話（PK）
    house_number TEXT,                           -- 號碼
    address      TEXT,                           -- 地址
    name         TEXT
);

-- ============================================================
-- (6) 顧客訂單 "order"
-- ============================================================
CREATE TABLE IF NOT EXISTS "order" (
    order_id       TEXT    PRIMARY KEY,          -- YYYYMMDD + 4碼流水號
    order_date     TEXT    NOT NULL,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now', '+8 hours')),
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now', '+8 hours')),
    status         TEXT    NOT NULL DEFAULT '待製作'
                   CHECK (status IN ('待製作','製作中','待付款','已完成','已取消')),
    customer_phone TEXT,                          -- 內用可 NULL
    FOREIGN KEY (customer_phone) REFERENCES delivery_customer(phone)
        ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_order_date ON "order"(order_date);
CREATE INDEX IF NOT EXISTS idx_order_status ON "order"(status);
CREATE INDEX IF NOT EXISTS idx_order_phone ON "order"(customer_phone);

-- ============================================================
-- (7) 顧客訂單-包含 order_item
--     ★ 存單價快照（漲價不影響歷史訂單）
-- ============================================================
CREATE TABLE IF NOT EXISTS order_item (
    order_id     TEXT    NOT NULL,
    item_id      INTEGER NOT NULL,
    quantity     INTEGER NOT NULL CHECK (quantity > 0),
    unit_price   INTEGER NOT NULL,               -- ★ 下單時的單價快照
    PRIMARY KEY (order_id, item_id),
    FOREIGN KEY (order_id) REFERENCES "order"(order_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES menu_item(item_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- ============================================================
-- (8) 進貨單 purchase_order（主表）— 含 total_amount
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_order (
    po_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    po_date        TEXT    NOT NULL,
    supplier_name  TEXT    NOT NULL,
    total_amount   REAL    NOT NULL DEFAULT 0,    -- 總金額（驗貨後彙總）
    status         TEXT    NOT NULL DEFAULT '已訂購'
                   CHECK (status IN ('已訂購','已驗貨','已退貨')),
    FOREIGN KEY (supplier_name) REFERENCES supplier(name)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_po_date ON purchase_order(po_date);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_order(supplier_name);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_order(status);

-- ============================================================
-- (9) 進貨單明細 purchase_order_item
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_order_item (
    po_id            INTEGER NOT NULL,
    ingredient_name  TEXT    NOT NULL,
    order_qty        REAL    NOT NULL,           -- 進貨數量（stock_unit）
    total_cost       REAL    NOT NULL DEFAULT 0, -- 總成本（驗貨後填入）
    PRIMARY KEY (po_id, ingredient_name),
    FOREIGN KEY (po_id) REFERENCES purchase_order(po_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (ingredient_name) REFERENCES ingredient(name)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- ============================================================
-- (10) 退貨單 return_order
--     同一 (po_id, ingredient_name) 可以有多筆退貨記錄
--     因此 PK 改用 return_id autoincrement；(po_id, ingredient_name) 留 index
-- ============================================================
CREATE TABLE IF NOT EXISTS return_order (
    return_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id            INTEGER NOT NULL,
    ingredient_name  TEXT    NOT NULL,
    return_date      TEXT    NOT NULL,
    return_reason    TEXT,
    return_qty       REAL    NOT NULL,
    FOREIGN KEY (po_id, ingredient_name)
        REFERENCES purchase_order_item(po_id, ingredient_name)
        ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_return_po ON return_order(po_id);
CREATE INDEX IF NOT EXISTS idx_return_po_ing ON return_order(po_id, ingredient_name);

-- ============================================================
-- (11) 食材—供應商 ingredient_supplier — M:N（一品多廠）
--   每個食材可以從多家供應商叫貨。
--   is_primary=1 標示老闆預設用的廠商；建議每個食材至少 1 筆 primary。
--   price_per_order_unit 紀錄該廠商該品項的單價（可選，方便估價）。
-- ============================================================
CREATE TABLE IF NOT EXISTS ingredient_supplier (
    ingredient_name      TEXT    NOT NULL,
    supplier_name        TEXT    NOT NULL,
    is_primary           INTEGER NOT NULL DEFAULT 0,
    price_per_order_unit REAL,
    PRIMARY KEY (ingredient_name, supplier_name),
    FOREIGN KEY (ingredient_name) REFERENCES ingredient(name)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (supplier_name) REFERENCES supplier(name)
        ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ing_sup_ingredient ON ingredient_supplier(ingredient_name);
CREATE INDEX IF NOT EXISTS idx_ing_sup_supplier   ON ingredient_supplier(supplier_name);