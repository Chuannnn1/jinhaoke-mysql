-- ============================================================
-- 金濠客食堂 POS 系統 — 資料庫 Schema
-- 更新版本：v2（2026-05-17）
-- 對齊 PDF 第柒節 ERD，共 10 張表
-- ============================================================

-- ============================================================
-- 1. 供應商（supplier）
-- ============================================================
CREATE TABLE IF NOT EXISTS supplier (
    supplier_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL UNIQUE,
    contact_name  TEXT,
    phone         TEXT,
    address       TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

-- ============================================================
-- 2. 食材（ingredient）
-- ============================================================
CREATE TABLE IF NOT EXISTS ingredient (
    ingredient_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name               TEXT    NOT NULL UNIQUE,
    unit               TEXT    NOT NULL,          -- 單位：斤、公斤、包、 ...
    stock_qty          REAL    NOT NULL DEFAULT 0,
    safety_stock       REAL    NOT NULL DEFAULT 0,   -- 安全庫存
    cost_per_unit      REAL    NOT NULL DEFAULT 0,   -- 成本（用於自動補貨計算）
    supplier_id        INTEGER NOT NULL,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (supplier_id) REFERENCES supplier(supplier_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_ingredient_supplier ON ingredient(supplier_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_low_stock ON ingredient(stock_qty);

-- ============================================================
-- 3. 餐點（menu_item）
-- ============================================================
CREATE TABLE IF NOT EXISTS menu_item (
    item_id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name                  TEXT    NOT NULL,
    category              TEXT    NOT NULL,
    price                 REAL    NOT NULL,
    description           TEXT    DEFAULT '',
    is_active             INTEGER NOT NULL DEFAULT 1,   -- 1=上架中, 0=已下架
    stock_qty             INTEGER NOT NULL DEFAULT 0,  -- 可供應份數（由原料庫存推算）
    low_stock_threshold   INTEGER NOT NULL DEFAULT 10,  -- 低庫存警示份數
    sort_order            INTEGER NOT NULL DEFAULT 0,
    created_at            TEXT    NOT NULL DEFAULT (datetime('now', '+8 hours')),
    updated_at            TEXT    NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_menu_category ON menu_item(category);
CREATE INDEX IF NOT EXISTS idx_menu_active ON menu_item(is_active);

-- ============================================================
-- 4. 食譜（recipe）— 餐點 M:N 食材的 junction table
-- ============================================================
CREATE TABLE IF NOT EXISTS recipe (
    recipe_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id        INTEGER NOT NULL,
    ingredient_id  INTEGER NOT NULL,
    consume_qty    REAL    NOT NULL,           -- 每份餐點消耗該食材的數量
    created_at     TEXT    NOT NULL DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (item_id)       REFERENCES menu_item(item_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES ingredient(ingredient_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    UNIQUE (item_id, ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_item ON recipe(item_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredient ON recipe(ingredient_id);

-- ============================================================
-- 5. 外送顧客（delivery_customer）— 對應 PDF「外送顧客單」
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_customer (
    phone      TEXT    PRIMARY KEY,             -- 電話為 PK
    name       TEXT    NOT NULL,
    address    TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

-- ============================================================
-- 6. 顧客訂單（"order"）— 注意使用雙引號因為 order 是 SQL 保留字
-- ============================================================
CREATE TABLE IF NOT EXISTS "order" (
    order_id         TEXT    PRIMARY KEY,
    customer_name    TEXT    NOT NULL,
    customer_phone   TEXT    NOT NULL,
    status           TEXT    NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'cooking', 'delivering', 'completed', 'cancelled')),
    note             TEXT    DEFAULT '',
    created_at       TEXT    NOT NULL DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (customer_phone) REFERENCES delivery_customer(phone)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_order_status ON "order"(status);
CREATE INDEX IF NOT EXISTS idx_order_created ON "order"(created_at);
CREATE INDEX IF NOT EXISTS idx_order_phone ON "order"(customer_phone);

-- ============================================================
-- 7. 顧客訂單明細（order_item）— 對應 PDF「顧客訂單-包含」
-- ============================================================
CREATE TABLE IF NOT EXISTS order_item (
    order_id   TEXT,
    item_id    INTEGER,
    quantity   INTEGER NOT NULL,
    PRIMARY KEY (order_id, item_id),
    FOREIGN KEY (order_id) REFERENCES "order"(order_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (item_id)  REFERENCES menu_item(item_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- ============================================================
-- 8. 訂購單（purchase_order）— 對應 PDF「訂購單」
-- 設計原則：一張單只訂一種食材（業務假設）
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_order (
    po_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_date     TEXT    NOT NULL,
    ingredient_id  INTEGER NOT NULL,              -- FK 到食材（同時鏈至供應商）
    ordered_qty    REAL    NOT NULL,              -- 訂購數量
    received_qty   REAL    DEFAULT 0,              -- 實際到貨量
    qualified_qty  REAL    DEFAULT 0,              -- 合格數量（入庫量）
    unit_price     REAL    NOT NULL,               -- 單價
    status         TEXT    NOT NULL DEFAULT 'ordered'
                     CHECK (status IN ('ordered', 'received', 'partial', 'returned')),
    created_at     TEXT    NOT NULL DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (ingredient_id) REFERENCES ingredient(ingredient_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_po_ingredient  ON purchase_order(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_po_order_date  ON purchase_order(order_date);
CREATE INDEX IF NOT EXISTS idx_po_status      ON purchase_order(status);

-- ============================================================
-- 9. 退貨單（return_order）— 對應 PDF「退貨單」
-- 設計原則：每張訂購單最多產生一張退貨單（1:1）
-- 退貨只退該訂購單對應的那一種食材，不需要子表
-- ============================================================
CREATE TABLE IF NOT EXISTS return_order (
    return_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id          INTEGER NOT NULL UNIQUE,        -- 1:1 對應訂購單
    return_date    TEXT    NOT NULL,
    return_qty     REAL    NOT NULL,               -- 退貨食材數量
    return_reason  TEXT    DEFAULT '',
    created_at     TEXT    NOT NULL DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (po_id) REFERENCES purchase_order(po_id)
        ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_return_po ON return_order(po_id);

-- ============================================================
-- 10. 庫存異動紀錄（inventory_log）— 實作輔助表
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_log (
    log_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id      INTEGER,                          -- 可為 NULL（純原料異動時）
    ingredient_id INTEGER,                         -- 可為 NULL（餐點異動時）
    change_qty   REAL    NOT NULL,                 -- 變動數量（可正可負）
    reason       TEXT    NOT NULL,
    order_id     TEXT,                             -- 關聯訂單（可為 NULL）
    po_id        INTEGER,                          -- 關聯訂購單（可為 NULL）
    created_at   TEXT    NOT NULL DEFAULT (datetime('now', '+8 hours')),
    FOREIGN KEY (item_id)       REFERENCES menu_item(item_id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    FOREIGN KEY (ingredient_id) REFERENCES ingredient(ingredient_id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    FOREIGN KEY (order_id)      REFERENCES "order"(order_id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    FOREIGN KEY (po_id)         REFERENCES purchase_order(po_id)
        ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_log_ingredient ON inventory_log(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_log_item      ON inventory_log(item_id);
CREATE INDEX IF NOT EXISTS idx_log_created   ON inventory_log(created_at);

-- ============================================================
-- Trigger：更新 menu_item.updated_at
-- ============================================================
CREATE TRIGGER IF NOT EXISTS trg_menu_updated
AFTER UPDATE ON menu_item
BEGIN
    UPDATE menu_item SET updated_at = datetime('now', '+8 hours')
    WHERE item_id = NEW.item_id;
END;