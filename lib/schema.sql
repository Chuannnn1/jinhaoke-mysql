-- ============================================================
-- 金濠客食堂 POS 系統 — Schema v4 (MySQL / MariaDB)
-- 更新日期：2026-06-20
-- 對齊 ER 文件，全中文表名/欄位名
-- ============================================================

-- (1) 供應商
CREATE TABLE IF NOT EXISTS `供應商` (
    `供應商名稱`   VARCHAR(100) PRIMARY KEY,
    `供應商電話`   TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (2) 食材
CREATE TABLE IF NOT EXISTS `食材` (
    `食材名稱`     VARCHAR(100) PRIMARY KEY,
    `庫存數量`     DOUBLE  NOT NULL DEFAULT 0,
    `安全存量`     DOUBLE  NOT NULL DEFAULT 0,
    `庫存單位`     VARCHAR(20) NOT NULL,
    `供應商名稱`   VARCHAR(100),
    FOREIGN KEY (`供應商名稱`) REFERENCES `供應商`(`供應商名稱`)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (3) 餐點
CREATE TABLE IF NOT EXISTS `餐點` (
    `餐點編號`     INT PRIMARY KEY AUTO_INCREMENT,
    `餐點名稱`     VARCHAR(100) NOT NULL UNIQUE,
    `餐點分類`     VARCHAR(50),
    `餐點價格`     INT NOT NULL,
    `分類標籤`     VARCHAR(50) NOT NULL DEFAULT '其他',
    `餐點描述`     TEXT,
    `上下架狀態`   TINYINT NOT NULL DEFAULT 1,
    `客製化屬性`   TEXT NOT NULL DEFAULT '[]',
    `圖示`         VARCHAR(10) NOT NULL DEFAULT '',
    `圖片網址`     TEXT NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (4) 食譜 — 消耗關係 (餐點 M:N 食材)
CREATE TABLE IF NOT EXISTS `食譜` (
    `餐點編號`     INT NOT NULL,
    `食材名稱`     VARCHAR(100) NOT NULL,
    `食材數量`     DOUBLE NOT NULL,
    PRIMARY KEY (`餐點編號`, `食材名稱`),
    FOREIGN KEY (`餐點編號`) REFERENCES `餐點`(`餐點編號`)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (`食材名稱`) REFERENCES `食材`(`食材名稱`)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (5) 訂單
CREATE TABLE IF NOT EXISTS `訂單` (
    `訂單編號`     VARCHAR(20) PRIMARY KEY,
    `訂單日期`     DATETIME NOT NULL,
    `訂單狀態`     VARCHAR(20) NOT NULL DEFAULT '待製作',
    `顧客電話`     VARCHAR(50),
    `備註`         TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (6) 訂單明細 — 包含關係 (訂單 M:N 餐點)
CREATE TABLE IF NOT EXISTS `訂單明細` (
    `訂單編號`     VARCHAR(20) NOT NULL,
    `餐點編號`     INT NOT NULL,
    `數量`         INT NOT NULL CHECK (`數量` > 0),
    `客製化`       TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (`訂單編號`, `餐點編號`),
    FOREIGN KEY (`訂單編號`) REFERENCES `訂單`(`訂單編號`)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (`餐點編號`) REFERENCES `餐點`(`餐點編號`)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (7) 採購單
CREATE TABLE IF NOT EXISTS `採購單` (
    `採購單編號`   INT PRIMARY KEY AUTO_INCREMENT,
    `採購單日期`   DATE NOT NULL,
    `供應商名稱`   VARCHAR(100) NOT NULL,
    `進貨食材總成本` DOUBLE NOT NULL DEFAULT 0,
    `採購單狀態`   VARCHAR(20) NOT NULL DEFAULT '已下單',
    FOREIGN KEY (`供應商名稱`) REFERENCES `供應商`(`供應商名稱`)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (8) 採購單明細 — 進貨關係 (採購單-食材)
CREATE TABLE IF NOT EXISTS `採購單明細` (
    `採購單編號`   INT NOT NULL,
    `食材名稱`     VARCHAR(100) NOT NULL,
    `數量`         DOUBLE NOT NULL,
    PRIMARY KEY (`採購單編號`, `食材名稱`),
    FOREIGN KEY (`採購單編號`) REFERENCES `採購單`(`採購單編號`)
        ON UPDATE CASCADE ON DELETE CASCADE,
    FOREIGN KEY (`食材名稱`) REFERENCES `食材`(`食材名稱`)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (9) 退貨單 — 產生關係 (採購單 1:N 退貨單)
CREATE TABLE IF NOT EXISTS `退貨單` (
    `退貨單編號`   INT PRIMARY KEY AUTO_INCREMENT,
    `採購單編號`   INT NOT NULL,
    `食材名稱`     VARCHAR(100) NOT NULL,
    `退貨單日期`   DATE NOT NULL,
    `退貨原因`     TEXT,
    `退貨數量`     DOUBLE NOT NULL,
    FOREIGN KEY (`採購單編號`, `食材名稱`)
        REFERENCES `採購單明細`(`採購單編號`, `食材名稱`)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

