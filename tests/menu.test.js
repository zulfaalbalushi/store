import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { openDatabase } from '../server/database/connection.js';
import {
  archiveDish,
  createCategory,
  createDish,
  deleteCategory,
  getDish,
  listCategories,
  listDishes,
  updateCategory,
  updateDish,
} from '../server/menu/service.js';

async function menuDatabase() {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'baytna-menu-'));
  const database = await openDatabase(path.join(temporaryDirectory, 'test.sqlite'));

  function createOwner(number) {
    const user = database.run(
      `INSERT INTO users (role, email, password_hash, full_name)
       VALUES ('store_owner', ?, 'test-only-hash', ?)`,
      `owner${number}@example.com`,
      `Owner Number ${number}`,
    );
    const userId = Number(user.lastInsertRowid);
    const business = database.run(
      `INSERT INTO businesses (owner_user_id, name, contact_email)
       VALUES (?, ?, ?)`,
      userId,
      `Business ${number}`,
      `owner${number}@example.com`,
    );

    return {
      business_id: Number(business.lastInsertRowid),
      user_id: userId,
    };
  }

  return {
    database,
    firstOwner: createOwner(1),
    secondOwner: createOwner(2),
    async close() {
      database.close();
      await rm(temporaryDirectory, { recursive: true });
    },
  };
}

function dishInput(overrides = {}) {
  return {
    categoryId: null,
    description: 'Slow-cooked Omani dish.',
    name: 'Shuwa',
    priceBaisa: 4500,
    status: 'draft',
    ...overrides,
  };
}

test('categories are Store-scoped, case-insensitive, and protected while referenced', async () => {
  const application = await menuDatabase();

  try {
    const category = await createCategory(application.database, application.firstOwner, {
      name: 'Main dishes',
    });
    assert.equal(category.name, 'Main dishes');
    await assert.rejects(
      () =>
        createCategory(application.database, application.firstOwner, {
          name: 'main DISHES',
        }),
      (error) => error.status === 409,
    );

    const secondCategory = await createCategory(application.database, application.secondOwner, {
      name: 'Mains',
    });
    await assert.rejects(
      () =>
        updateCategory(application.database, application.firstOwner, secondCategory.id, {
          name: 'Changed',
        }),
      (error) => error.status === 404,
    );

    await createDish(
      application.database,
      application.firstOwner,
      dishInput({ categoryId: category.id }),
    );
    await assert.rejects(
      () => deleteCategory(application.database, application.firstOwner, category.id),
      (error) => error.status === 409,
    );

    const emptyCategory = await createCategory(application.database, application.firstOwner, {
      name: 'Seasonal',
    });
    assert.deepEqual(
      await deleteCategory(application.database, application.firstOwner, emptyCategory.id),
      {
        deleted: true,
        id: emptyCategory.id,
      },
    );

    const categories = await listCategories(application.database, application.firstOwner);
    assert.deepEqual(categories, [{ dishCount: 1, id: category.id, name: 'Main dishes' }]);
  } finally {
    await application.close();
  }
});

test('dish validation rejects unsafe price and cross-business category IDs', async () => {
  const application = await menuDatabase();

  try {
    const otherCategory = await createCategory(application.database, application.secondOwner, {
      name: 'Private category',
    });

    await assert.rejects(
      () =>
        createDish(application.database, application.firstOwner, dishInput({ priceBaisa: 4.5 })),
      (error) => error.status === 422 && Boolean(error.details.priceBaisa),
    );
    await assert.rejects(
      () =>
        createDish(
          application.database,
          application.firstOwner,
          dishInput({ categoryId: otherCategory.id }),
        ),
      (error) => error.status === 422 && Boolean(error.details.categoryId),
    );
  } finally {
    await application.close();
  }
});

test('owners can create, filter, update, and archive only their dishes', async () => {
  const application = await menuDatabase();

  try {
    const mains = await createCategory(application.database, application.firstOwner, {
      name: 'Mains',
    });
    const shuwa = await createDish(
      application.database,
      application.firstOwner,
      dishInput({ categoryId: mains.id, status: 'active' }),
    );
    await createDish(
      application.database,
      application.firstOwner,
      dishInput({
        categoryId: mains.id,
        name: 'Harees',
        priceBaisa: 2500,
        status: 'unavailable',
      }),
    );
    await createDish(
      application.database,
      application.firstOwner,
      dishInput({ name: 'Luqaimat', priceBaisa: 1800 }),
    );

    const filtered = await listDishes(
      application.database,
      application.firstOwner,
      new URLSearchParams({
        categoryId: String(mains.id),
        page: '1',
        pageSize: '1',
        search: 'a',
        sort: 'price_asc',
        status: 'all',
      }),
    );
    assert.equal(filtered.dishes.length, 1);
    assert.equal(filtered.dishes[0].name, 'Harees');
    assert.equal(filtered.pagination.totalItems, 2);
    assert.equal(filtered.pagination.totalPages, 2);

    await assert.rejects(
      () =>
        updateDish(
          application.database,
          application.firstOwner,
          shuwa.id,
          dishInput({ categoryId: mains.id, status: 'draft' }),
        ),
      (error) => error.status === 409,
    );

    const unavailable = await updateDish(
      application.database,
      application.firstOwner,
      shuwa.id,
      dishInput({ categoryId: mains.id, status: 'unavailable' }),
    );
    assert.equal(unavailable.status, 'unavailable');

    const archived = await archiveDish(application.database, application.firstOwner, shuwa.id);
    assert.equal(archived.status, 'archived');
    await assert.rejects(
      () => updateDish(application.database, application.firstOwner, shuwa.id, dishInput()),
      (error) => error.status === 409,
    );

    await assert.rejects(
      () => getDish(application.database, application.secondOwner, shuwa.id),
      (error) => error.status === 404,
    );
    await assert.rejects(
      () => archiveDish(application.database, application.secondOwner, shuwa.id),
      (error) => error.status === 404,
    );

    const currentMenu = await listDishes(
      application.database,
      application.firstOwner,
      new URLSearchParams({ status: 'all' }),
    );
    assert.equal(
      currentMenu.dishes.some((dish) => dish.id === shuwa.id),
      false,
    );

    const archivedMenu = await listDishes(
      application.database,
      application.firstOwner,
      new URLSearchParams({ status: 'archived' }),
    );
    assert.equal(archivedMenu.dishes[0].id, shuwa.id);
    assert.ok(
      application.database.get(
        "SELECT id FROM audit_events WHERE action = 'dish.archived' AND resource_id = ?",
        shuwa.id,
      ),
    );
  } finally {
    await application.close();
  }
});
