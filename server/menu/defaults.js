export const DEFAULT_CATEGORY_NAMES = Object.freeze([
  'Main dishes',
  'Appetizers',
  'Sweets & Desserts',
  'Breads',
  'Drinks',
]);

export function createDefaultCategories(database, businessId) {
  for (const name of DEFAULT_CATEGORY_NAMES) {
    database.run(
      'INSERT OR IGNORE INTO categories (business_id, name) VALUES (?, ?)',
      businessId,
      name,
    );
  }
}
