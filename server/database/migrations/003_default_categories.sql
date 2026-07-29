INSERT OR IGNORE INTO categories (business_id, name)
SELECT id, 'Main dishes' FROM businesses;

INSERT OR IGNORE INTO categories (business_id, name)
SELECT id, 'Appetizers' FROM businesses;

INSERT OR IGNORE INTO categories (business_id, name)
SELECT id, 'Sweets & Desserts' FROM businesses;

INSERT OR IGNORE INTO categories (business_id, name)
SELECT id, 'Breads' FROM businesses;

INSERT OR IGNORE INTO categories (business_id, name)
SELECT id, 'Drinks' FROM businesses;
