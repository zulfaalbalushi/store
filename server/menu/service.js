import { conflict, notFound, validationError } from '../http/errors.js';

const DISH_STATUSES = new Set(['draft', 'active', 'unavailable']);
const STATUS_TRANSITIONS = {
  draft: new Set(['draft', 'active', 'unavailable']),
  active: new Set(['active', 'unavailable']),
  unavailable: new Set(['unavailable', 'active', 'draft']),
};
const SORTS = {
  updated_desc: 'dishes.updated_at DESC, dishes.id DESC',
  name_asc: 'LOWER(dishes.name) ASC, dishes.id ASC',
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

async function audit(database, session, action, resourceType, resourceId, fields = []) {
  await database.run(
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

async function categoryNameExists(database, businessId, name, excludedCategoryId = null) {
  const parameters = [businessId, name];
  let sql = 'SELECT id FROM categories WHERE business_id = ? AND LOWER(name) = LOWER(?)';

  if (excludedCategoryId) {
    sql += ' AND id != ?';
    parameters.push(excludedCategoryId);
  }

  return Boolean(await database.get(sql, ...parameters));
}

export async function listCategories(database, session) {
  return (
    await database.all(
      `SELECT categories.id, categories.name, COUNT(dishes.id) AS dish_count
     FROM categories
     LEFT JOIN dishes
       ON dishes.category_id = categories.id
       AND dishes.business_id = categories.business_id
       AND dishes.status != 'archived'
     WHERE categories.business_id = ?
     GROUP BY categories.id, categories.name
     ORDER BY LOWER(categories.name)`,
      session.business_id,
    )
  ).map((category) => ({
    dishCount: Number(category.dish_count),
    id: category.id,
    name: category.name,
  }));
}

export async function createCategory(database, session, input) {
  const name = validateCategoryName(input);

  if (await categoryNameExists(database, session.business_id, name)) {
    throw conflict('A category with this name already exists.');
  }

  const categoryId = await database.insert(
    'INSERT INTO categories (business_id, name) VALUES (?, ?)',
    session.business_id,
    name,
  );
  await audit(database, session, 'category.created', 'category', categoryId, ['name']);

  return { dishCount: 0, id: categoryId, name };
}

export async function updateCategory(database, session, categoryId, input) {
  const id = positiveInteger(categoryId);
  const name = validateCategoryName(input);
  const existing = id
    ? await database.get(
        'SELECT id FROM categories WHERE id = ? AND business_id = ?',
        id,
        session.business_id,
      )
    : null;

  if (!existing) throw notFound('The category was not found.');
  if (await categoryNameExists(database, session.business_id, name, id)) {
    throw conflict('A category with this name already exists.');
  }

  await database.run(
    `UPDATE categories
     SET name = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND business_id = ?`,
    name,
    id,
    session.business_id,
  );
  await audit(database, session, 'category.updated', 'category', id, ['name']);

  return (await listCategories(database, session)).find((category) => category.id === id);
}

export async function deleteCategory(database, session, categoryId) {
  const id = positiveInteger(categoryId);
  const category = id
    ? await database.get(
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

  await database.run(
    'DELETE FROM categories WHERE id = ? AND business_id = ?',
    id,
    session.business_id,
  );
  await audit(database, session, 'category.deleted', 'category', id);

  return { deleted: true, id };
}

async function validateDish(database, session, input) {
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
    !(await database.get(
      'SELECT id FROM categories WHERE id = ? AND business_id = ?',
      values.categoryId,
      session.business_id,
    ))
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

async function ownedDish(database, session, dishId) {
  const id = positiveInteger(dishId);
  const dish = id
    ? await database.get(
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

export async function listDishes(database, session, query) {
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
      "(LOWER(dishes.name) LIKE LOWER(?) ESCAPE '\\' OR LOWER(dishes.description) LIKE LOWER(?) ESCAPE '\\')",
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
  const count = Number(
    (await database.get(`SELECT COUNT(*) AS total FROM dishes WHERE ${whereSql}`, ...parameters))
      .total,
  );
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const currentPage = Math.min(page, totalPages);
  const dishes = (
    await database.all(
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
  ).map(dishResponse);

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

export async function getDish(database, session, dishId) {
  return dishResponse(await ownedDish(database, session, dishId));
}

export async function createDish(database, session, input) {
  const values = await validateDish(database, session, input);
  const dishId = await database.insert(
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
  await audit(database, session, 'dish.created', 'dish', dishId, [
    'categoryId',
    'name',
    'description',
    'priceBaisa',
    'status',
  ]);

  return dishResponse(await ownedDish(database, session, dishId));
}

export async function updateDish(database, session, dishId, input) {
  const existing = await ownedDish(database, session, dishId);
  if (existing.status === 'archived') {
    throw conflict('Archived dishes cannot be edited.');
  }

  const values = await validateDish(database, session, input);
  if (!STATUS_TRANSITIONS[existing.status].has(values.status)) {
    throw conflict(`A ${existing.status} dish cannot be changed directly to ${values.status}.`);
  }

  await database.run(
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
  await audit(database, session, 'dish.updated', 'dish', existing.id, [
    'categoryId',
    'name',
    'description',
    'priceBaisa',
    'status',
  ]);

  return dishResponse(await ownedDish(database, session, existing.id));
}

export async function archiveDish(database, session, dishId) {
  const existing = await ownedDish(database, session, dishId);
  if (existing.status === 'archived') throw conflict('The dish is already archived.');

  await database.run(
    `UPDATE dishes
     SET status = 'archived', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND business_id = ?`,
    existing.id,
    session.business_id,
  );
  await audit(database, session, 'dish.archived', 'dish', existing.id, ['status']);

  return dishResponse(await ownedDish(database, session, existing.id));
}
