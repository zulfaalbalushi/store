export const DEFAULT_CATEGORY_NAMES = Object.freeze([
  'Main dishes',
  'Appetizers',
  'Sweets & Desserts',
  'Breads',
  'Drinks',
]);

export async function createDefaultCategories(database, businessId) {
  for (const name of DEFAULT_CATEGORY_NAMES) {
    await database.run(
      `INSERT INTO categories (business_id, name) VALUES (?, ?)
       ON CONFLICT DO NOTHING`,
      businessId,
      name,
    );
  }
}
