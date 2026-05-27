-- ============================================================
-- 金濠客食堂 POS 系統 — 測試資料 Seed v3
-- 更新日期：2026-05-22
-- 對應 schema.sql v3
-- ============================================================

-- ============================================================
-- 供應商（supplier）
-- ============================================================
INSERT INTO supplier (name, phone) VALUES
  ('海鮮批發工', '05-2200001'),
  ('肉品大王',   '05-2200002'),
  ('大成肉品',   '05-2200003'),
  ('糧油行',     '05-2200004'),
  ('蔬果行',     '05-2200005');

-- ============================================================
-- 食材（ingredient）
-- 格式：name, stock_qty, safety_stock, stock_unit, order_unit, qty_per_order_unit, supplier_name
-- ============================================================
INSERT INTO ingredient VALUES
  ('魚排',       30, 15, '片', '箱', 60, '海鮮批發工');
INSERT INTO ingredient VALUES
  ('豬排',       45, 20, '片', '箱', 60, '肉品大王');
INSERT INTO ingredient VALUES
  ('帶骨排骨',   32, 15, '片', '箱', 65, '大成肉品');
INSERT INTO ingredient VALUES
  ('紅麴豬',     28, 15, '份', '包', 20, '肉品大王');
INSERT INTO ingredient VALUES
  ('炸排骨',     8,  10, '份', '包', 15, '大成肉品');
INSERT INTO ingredient VALUES
  ('鱸雞腿',     22, 10, '隻', '包', 10, '肉品大王');
INSERT INTO ingredient VALUES
  ('蘇嫩雞腿',   15, 10, '隻', '包', 15, '大成肉品');
INSERT INTO ingredient VALUES
  ('牛肉',       60, 30, 'kg', '包', 2,  '肉品大王');
INSERT INTO ingredient VALUES
  ('豬肉',       50, 30, 'kg', '包', 2,  '肉品大王');
INSERT INTO ingredient VALUES
  ('沙茶雞',     6,  4,  'kg', '盒', 1,  '肉品大王');
INSERT INTO ingredient VALUES
  ('白米',       80, 30, '公斤', '包', 25, '糧油行');
INSERT INTO ingredient VALUES
  ('高麗菜',     30, 8,  '顆', '箱', 10, '蔬果行');

-- ============================================================
-- 菜單（menu_item）
-- 全量對齊 MOCK_MENU：emoji / tag / sub / option / description
-- ============================================================
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('大比目魚排便當', '手作便當', 130, '🐟', '魚', '扁鱈', '', '扁鱈魚排配三樣配菜');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('酥炸豬排便當', '手作便當', 130, '🐷', '豬', '', '', '酥炸厚切豬排配三樣配菜');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('酥嫩雞腿便當', '手作便當', 130, '🍗', '雞', '', '', '酥嫩雞腿配三樣配菜');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('紅麴豬五花便當', '手作便當', 120, '🐷', '豬', '', '', '紅麴豬五花配三樣配菜');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('酥炸排骨便當', '手作便當', 100, '🐷', '豬', '無骨', '', '無骨酥炸排骨配三樣配菜');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('滷豬腳便當', '手作便當', 100, '🐷', '豬', '', '', '滷豬腳配三樣配菜');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('滷雞腿便當', '手作便當', 100, '🍗', '雞', '', '', '滷雞腿配三樣配菜');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('滷排骨便當', '手作便當', 100, '🥚', '豬', '帶骨·附滷蛋', '', '帶骨滷排骨附滷蛋配三樣配菜');

INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('沙茶牛肉燴飯', '燴飯', 110, '🥩', '牛', '', '加肉60 / 加菜10', '沙茶牛肉');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('沙茶雞柳燴飯', '燴飯', 110, '🍗', '雞', '', '加肉60 / 加菜10', '沙茶雞柳');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('沙茶豬肉燴飯', '燴飯', 100, '🐷', '豬', '', '加肉50 / 加菜10', '沙茶豬肉');

INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('大比目魚排', '單點', 100, '🐟', '魚', '扁鱈', '', '扁鱈魚排');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('酥炸豬排', '單點', 100, '🐷', '豬', '', '', '酥炸厚切豬排');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('酥嫩雞腿', '單點', 100, '🍗', '雞', '', '', '酥嫩雞腿');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('紅麴豬五花', '單點', 90, '🐷', '豬', '', '', '紅麴豬五花');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('沙茶燴牛肉', '單點', 90, '🥩', '牛', '', '加肉60 / 加菜10', '沙茶燴牛肉');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('滷排骨', '單點', 80, '🐷', '豬', '二片', '', '二片');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('沙茶燴豬肉', '單點', 80, '🐷', '豬', '', '加肉50 / 加菜10', '沙茶燴豬肉');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('酥炸排骨', '單點', 70, '🐷', '豬', '無骨', '', '無骨');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('滷雞腿', '單點', 70, '🍗', '雞', '', '', '滷雞腿');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('季節炒時蔬', '單點', 60, '🥬', '其他', '', '', '時令蔬菜');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('白飯', '單點', 20, '🍚', '其他', '', '', '白飯');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('滷蛋', '單點', 15, '🥚', '其他', '', '', '滷蛋');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('加購湯品', '單點', 10, '🍜', '其他', '', '', '例湯');
INSERT INTO menu_item (name, category, price, emoji, tag, sub, option, description) VALUES
  ('加購菜脯', '單點', 5, '🥢', '其他', '原味/辣味', '', '原味/辣味');

-- ============================================================
-- 食譜（recipe）— 每份餐點消耗的食材（stock_unit）
-- ============================================================
-- 手作便當（item_id 1-8）
INSERT INTO recipe VALUES (1, '魚排',  1);
INSERT INTO recipe VALUES (1, '白米',  0.3);
INSERT INTO recipe VALUES (2, '豬排',  1);
INSERT INTO recipe VALUES (2, '白米',  0.3);
INSERT INTO recipe VALUES (3, '鱸雞腿', 1);
INSERT INTO recipe VALUES (3, '白米',  0.3);
INSERT INTO recipe VALUES (4, '紅麴豬', 1);
INSERT INTO recipe VALUES (4, '白米',  0.3);
INSERT INTO recipe VALUES (5, '炸排骨', 1);
INSERT INTO recipe VALUES (5, '白米',  0.3);
INSERT INTO recipe VALUES (6, '帶骨排骨', 1);
INSERT INTO recipe VALUES (6, '白米',  0.3);
INSERT INTO recipe VALUES (7, '蘇嫩雞腿', 1);
INSERT INTO recipe VALUES (7, '白米',  0.3);
INSERT INTO recipe VALUES (8, '帶骨排骨', 1);
INSERT INTO recipe VALUES (8, '白米',  0.3);

-- 燴飯（item_id 9-11）
INSERT INTO recipe VALUES (9,  '牛肉',  0.2);
INSERT INTO recipe VALUES (9,  '白米',  0.3);
INSERT INTO recipe VALUES (10, '沙茶雞', 0.15);
INSERT INTO recipe VALUES (10, '白米',  0.3);
INSERT INTO recipe VALUES (11, '豬肉',  0.2);
INSERT INTO recipe VALUES (11, '白米',  0.3);

-- ============================================================
-- 外送顧客（delivery_customer）
-- ============================================================
INSERT INTO delivery_customer (phone, name, address) VALUES
  ('0912-345-678', '王小明', '台北市大安區新生南路一段'),
  ('0933-456-789', '陳小美', '新北市板橋區中山路'),
  ('0944-567-890', '張小華', '台北市信義區基隆路');

-- ============================================================
-- 顧客訂單（"order"）— status：待製作/製作中/待付款/已完成/已取消
-- ============================================================
INSERT INTO "order" (order_id, order_date, status, customer_phone) VALUES
  ('20260525001', '2026-05-25', '已完成', '0912-345-678');
INSERT INTO "order" (order_id, order_date, status, customer_phone) VALUES
  ('20260525002', '2026-05-25', '待製作', '0933-456-789');
INSERT INTO "order" (order_id, order_date, status, customer_phone) VALUES
  ('20260525003', '2026-05-25', '製作中', '0944-567-890');

-- ============================================================
-- 顧客訂單明細（order_item）— unit_price 為下單時的單價快照
-- ============================================================
INSERT INTO order_item VALUES
  ('20260525001', 1,  2, 130);  -- 王小明：大比目魚排便當 x2
INSERT INTO order_item VALUES
  ('20260525001', 9,  1, 110);  -- 王小明：沙茶牛肉燴飯 x1
INSERT INTO order_item VALUES
  ('20260525002', 2,  3, 130);  -- 陳小美：酥炸豬排便當 x3
INSERT INTO order_item VALUES
  ('20260525002', 22, 2, 20);   -- 陳小美：白飯 x2
INSERT INTO order_item VALUES
  ('20260525003', 5,  1, 100);  -- 張小華：酥炸排骨便當 x1

-- ============================================================
-- 進貨單（purchase_order）+ 明細（purchase_order_item）
-- ============================================================
INSERT INTO purchase_order (po_date, supplier_name, total_amount, status) VALUES
  ('2026-05-20', '大成肉品', 0, '已驗貨');
INSERT INTO purchase_order_item (po_id, ingredient_name, order_qty, total_cost) VALUES
  (1, '帶骨排骨', 65, 9750);  -- 65片 x 150元

INSERT INTO purchase_order (po_date, supplier_name, total_amount, status) VALUES
  ('2026-05-22', '肉品大王', 0, '已訂購');
INSERT INTO purchase_order_item (po_id, ingredient_name, order_qty, total_cost) VALUES
  (2, '鱸雞腿', 10, 0);
INSERT INTO purchase_order_item (po_id, ingredient_name, order_qty, total_cost) VALUES
  (2, '蘇嫩雞腿', 15, 0);