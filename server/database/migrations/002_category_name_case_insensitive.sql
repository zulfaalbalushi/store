CREATE UNIQUE INDEX idx_categories_business_name_nocase
ON categories(business_id, name COLLATE NOCASE);
