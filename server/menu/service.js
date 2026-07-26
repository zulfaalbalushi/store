import { conflict, notFound, validationError } from '../http/errors.js';

const DISH_STATUSES = new Set(['draft', 'active', 'unavailable']);
const STATUS_TRANSITIONS = {
  draft: new Set(['draft', 'active', 'unavailable']),
  active: new Set(['active', 'unavailable']),
  unavailable: new Set(['unavailable', 'active', 'draft']),
};
const SORTS = {
  updated_desc: 'dishes.updated_at DESC, dishes.id DESC',
  name_asc: 'dishes.name COLLATE NOCASE ASC, dishes.id ASC',
  price_asc: 'dishes.price_baisa ASC, dishes.id ASC',
  price_desc: 'dishes.price_baisa DESC, dishes.id DESC',
};

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function audit(database, session, action, resourceType, resourceId, fields = []) {
  database.run(
    `INSERT INTO audit_events
      (business_id, actor_user_id, action, resource_type, resource_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    session.business_id,
    session.user_id,
    action,
    resourceType,
    resourceId,
    JSON.stringify({ fields }),
  );
}

function validateCategoryName(input) {
  const name = cleanText(input.name);

  if (name.length < 2 || name.length > 80) {
    throw validationError({
      name: 'Category name must contain between 2 and 80 characters.',
    });
  }

  return name;
}

function categoryNameExists(database, businessId, name, excludedCategoryId = null) {
  const parameters = [businessId, name];
  let sql = 'SELECT id FROM categories WHERE business_id = ? AND name = ? COLLATE NOCASE';

  if (excludedCategoryId) {
    sql += ' AND id != ?';
    parameters.push(excludedCategoryId);
  }

  return Boolean(database.get(sql, ...parameters));
}

export function listCategories(database, session) {
  return database
    .all(
      `SELECT categories.id, categories.name, COUNT(dishes.id) AS dish_count
     FROM categories
     LEFT JOIN dishes
       ON dishes.category_id = categories.id
       AND dishes.business_id = categories.business_id
       AND dishes.status != 'archived'
     WHERE categories.business_id = ?
     GROUP BY categories.id, categories.name
     ORDER BY categories.name COLLATE NOCASE`,
      session.business_id,
    )
    .map((category) => ({
      dishCount: category.dish_count,
      id: category.id,
      name: category.name,
    }));
}

export function createCategory(database, session, input) {
  const name = validateCategoryName(input);

  if (categoryNameExists(database, session.business_id, name)) {
    throw conflict('A category with this name already exists.');
  }

  const result = database.run(
    'INSERT INTO categories (business_id, name) VALUES (?, ?)',
    session.business_id,
    name,
  );
  const categoryId = Number(result.lastInsertRowid);
  audit(database, session, 'category.created', 'category', categoryId, ['name']);

  return { dishCount: 0, id: categoryId, name };
}

export function updateCategory(database, session, categoryId, input) {
  const id = positiveInteger(categoryId);
  const name = validateCategoryName(input);
  const existing = id
    ? database.get(
        'SELECT id FROM categories WHERE id = ? AND business_id = ?',
        id,
        session.business_id,
      )
    : null;

  if (!existing) throw notFound('The category was not found.');
  if (categoryNameExists(database, session.business_id, name, id)) {
    throw conflict('A category with this name already exists.');
  }

  database.run(
    `UPDATE categories
     SET name = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND business_id = ?`,
    name,
    id,
    session.business_id,
  );
  audit(database, session, 'category.updated', 'category', id, ['name']);

  return listCategories(database, session).find((category) => category.id === id);
}

export function deleteCategory(database, session, categoryId) {
  const id = positiveInteger(categoryId);
  const category = id
    ? database.get(
        `SELECT categories.id, COUNT(dishes.id) AS dish_count
         FROM categories
         LEFT JOIN dishes ON dishes.category_id = categories.id
         WHERE categories.id = ? AND categories.business_id = ?
         GROUP BY categories.id`,
        id,
        session.business_id,
      )
    : null;

  if (!category) throw notFound('The category was not found.');
  if (category.dish_count > 0) {
    throw conflict('This category is used by one or more dishes and cannot be deleted.');
  }

  database.run('DELETE FROM categories WHERE id = ? AND business_id = ?', id, session.business_id);
  audit(database, session, 'category.deleted', 'category', id);

  return { deleted: true, id };
}

function validateDish(database, session, input) {
  const errors = {};
  const values = {
    name: cleanText(input.name),
    description: cleanText(input.description),
    priceBaisa: Number(input.priceBaisa),
    categoryId:
      input.categoryId === null || input.categoryId === ''
        ? null
        : positiveInteger(input.categoryId),
    status: cleanText(input.status),
  };

  if (values.name.length < 2 || values.name.length > 120) {
    errors.name = 'Dish name must contain between 2 and 120 characters.';
  }
  if (values.description.length > 1000) {
    errors.description = 'Description cannot exceed 1,000 characters.';
  }
  if (
    !Number.isInteger(values.priceBaisa) ||
    values.priceBaisa < 0 ||
    values.priceBaisa > 1_000_000
  ) {
    errors.priceBaisa = 'Price must be between 0.000 and 1,000.000 OMR.';
  }
  if (!DISH_STATUSES.has(values.status)) {
    errors.status = 'Select a valid dish status.';
  }
  if (input.categoryId !== null && input.categoryId !== '' && !values.categoryId) {
    errors.categoryId = 'Select a valid category.';
  }
  if (
    values.categoryId &&
    !database.get(
      'SELECT id FROM categories WHERE id = ? AND business_id = ?',
      values.categoryId,
      session.business_id,
    )
  ) {
    errors.categoryId = 'The selected category does not belong to your business.';
  }

  if (Object.keys(errors).length > 0) throw validationError(errors);
  return values;
}

function dishResponse(row) {
  return {
    categoryId: row.category_id,
    categoryName: row.category_name,
    createdAt: row.created_at,
    description: row.description,
    id: row.id,
    name: row.name,
    priceBaisa: row.price_baisa,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function ownedDish(database, session, dishId) {
  const id = positiveInteger(dishId);
  const dish = id
    ? database.get(
        `SELECT dishes.*, categories.name AS category_name
         FROM dishes
         LEFT JOIN categories
           ON categories.id = dishes.category_id
           AND categories.business_id = dishes.business_id
         WHERE dishes.id = ? AND dishes.business_id = ?`,
        id,
        session.business_id,
      )
    : null;

  if (!dish) throw notFound('The dish was not found.');
  return dish;
}

export function listDishes(database, session, query) {
  const search = cleanText(query.get('search'));
  const requestedStatus = cleanText(query.get('status')) || 'all';
  const categoryId = query.get('categoryId') ? positiveInteger(query.get('categoryId')) : null;
  const page = Math.max(1, positiveInteger(query.get('page')) || 1);
  const pageSize = Math.min(50, Math.max(1, positiveInteger(query.get('pageSize')) || 10));
  const sort = SORTS[query.get('sort')] ? query.get('sort') : 'updated_desc';
  const where = ['dishes.business_id = ?'];
  const parameters = [session.business_id];

  if (search) {
    const escapedSearch = search.replace(/[\\%_]/g, '\\$&');
    where.push(
      "(dishes.name LIKE ? ESCAPE '\\' COLLATE NOCASE OR dishes.description LIKE ? ESCAPE '\\' COLLATE NOCASE)",
    );
    parameters.push(`%${escapedSearch}%`, `%${escapedSearch}%`);
  }

  if (requestedStatus === 'all') {
    where.push("dishes.status != 'archived'");
  } else if (['draft', 'active', 'unavailable', 'archived'].includes(requestedStatus)) {
    where.push('dishes.status = ?');
    parameters.push(requestedStatus);
  } else {
    throw validationError({ status: 'Select a valid status filter.' });
  }

  if (query.get('categoryId') && !categoryId) {
    throw validationError({ categoryId: 'Select a valid category filter.' });
  }
  if (categoryId) {
    where.push('dishes.category_id = ?');
    parameters.push(categoryId);
  }

  const whereSql = where.join(' AND ');
  const count = database.get(
    `SELECT COUNT(*) AS total FROM dishes WHERE ${whereSql}`,
    ...parameters,
  ).total;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const currentPage = Math.min(page, totalPages);
  const dishes = database
    .all(
      `SELECT dishes.*, categories.name AS category_name
       FROM dishes
       LEFT JOIN categories
         ON categories.id = dishes.category_id
         AND categories.business_id = dishes.business_id
       WHERE ${whereSql}
       ORDER BY ${SORTS[sort]}
       LIMIT ? OFFSET ?`,
      ...parameters,
      pageSize,
      (currentPage - 1) * pageSize,
    )
    .map(dishResponse);

  return {
    dishes,
    pagination: {
      page: currentPage,
      pageSize,
      totalItems: count,
      totalPages,
    },
  };
}

export function getDish(database, session, dishId) {
  return dishResponse(ownedDish(database, session, dishId));
}

export function createDish(database, session, input) {
  const values = validateDish(database, session, input);
  const result = database.run(
    `INSERT INTO dishes
      (business_id, category_id, name, description, price_baisa, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    session.business_id,
    values.categoryId,
    values.name,
    values.description,
    values.priceBaisa,
    values.status,
  );
  const dishId = Number(result.lastInsertRowid);
  audit(database, session, 'dish.created', 'dish', dishId, [
    'categoryId',
    'name',
    'description',
    'priceBaisa',
    'status',
  ]);

  return dishResponse(ownedDish(database, session, dishId));
}

export function updateDish(database, session, dishId, input) {
  const existing = ownedDish(database, session, dishId);
  if (existing.status === 'archived') {
    throw conflict('Archived dishes cannot be edited.');
  }

  const values = validateDish(database, session, input);
  if (!STATUS_TRANSITIONS[existing.status].has(values.status)) {
    throw conflict(`A ${existing.status} dish cannot be changed directly to ${values.status}.`);
  }

  database.run(
    `UPDATE dishes
     SET category_id = ?, name = ?, description = ?, price_baisa = ?, status = ?,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND business_id = ?`,
    values.categoryId,
    values.name,
    values.description,
    values.priceBaisa,
    values.status,
    existing.id,
    session.business_id,
  );
  audit(database, session, 'dish.updated', 'dish', existing.id, [
    'categoryId',
    'name',
    'description',
    'priceBaisa',
    'status',
  ]);

  return dishResponse(ownedDish(database, session, existing.id));
}

export function archiveDish(database, session, dishId) {
  const existing = ownedDish(database, session, dishId);
  if (existing.status === 'archived') throw conflict('The dish is already archived.');

  database.run(
    `UPDATE dishes
     SET status = 'archived', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND business_id = ?`,
    existing.id,
    session.business_id,
  );
  audit(database, session, 'dish.archived', 'dish', existing.id, ['status']);

  return dishResponse(ownedDish(database, session, existing.id));
}
