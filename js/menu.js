(function initializeMenu() {
  const addDishButton = document.getElementById('add-dish-button');
  if (!addDishButton) return;

  const state = {
    categories: [],
    dishes: [],
    editingDish: null,
    page: 1,
    pagination: null,
  };
  const message = document.getElementById('menu-message');
  const categoryCount = document.getElementById('category-count');
  const categoryForm = document.getElementById('category-form');
  const categoryNameInput = document.getElementById('new-category-name');
  const categoryError = document.getElementById('new-category-error');
  const categoryList = document.getElementById('category-list');
  const filters = document.getElementById('menu-filters');
  const searchInput = document.getElementById('dish-search');
  const categoryFilter = document.getElementById('category-filter');
  const statusFilter = document.getElementById('status-filter');
  const sortFilter = document.getElementById('sort-filter');
  const dishTotal = document.getElementById('dish-total');
  const loading = document.getElementById('menu-loading');
  const emptyState = document.getElementById('menu-empty');
  const emptyCopy = document.getElementById('menu-empty-copy');
  const emptyAddDish = document.getElementById('empty-add-dish');
  const tableWrap = document.getElementById('dish-table-wrap');
  const tableBody = document.getElementById('dish-table-body');
  const pagination = document.getElementById('menu-pagination');
  const previousPage = document.getElementById('previous-page');
  const nextPage = document.getElementById('next-page');
  const pageSummary = document.getElementById('page-summary');
  const dialog = document.getElementById('dish-dialog');
  const dishForm = document.getElementById('dish-form');
  const dialogTitle = document.getElementById('dish-dialog-title');
  const closeDialog = document.getElementById('close-dish-dialog');
  const cancelDish = document.getElementById('cancel-dish');
  const saveDish = document.getElementById('save-dish');
  const formMessage = document.getElementById('dish-form-message');
  const dishName = document.getElementById('dish-name');
  const dishCategory = document.getElementById('dish-category');
  const dishPrice = document.getElementById('dish-price');
  const dishStatus = document.getElementById('dish-status');
  const dishDescription = document.getElementById('dish-description');

  function setMessage(text, type) {
    message.textContent = text;
    message.className = `business-alert business-alert--${type}`;
    message.hidden = false;
  }

  function clearMessage() {
    message.hidden = true;
    message.textContent = '';
  }

  function element(tag, className, text) {
    const created = document.createElement(tag);
    if (className) created.className = className;
    if (text !== undefined) created.textContent = text;
    return created;
  }

  function formatPrice(priceBaisa) {
    return `${(priceBaisa / 1000).toFixed(3)} OMR`;
  }

  function parsePrice(value) {
    const normalized = value.trim();
    if (!/^\d{1,4}(?:\.\d{1,3})?$/.test(normalized)) return null;

    const [whole, fraction = ''] = normalized.split('.');
    const priceBaisa = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
    return priceBaisa <= 1_000_000 ? priceBaisa : null;
  }

  function setSelectOptions(select, includeAllOption) {
    const selectedValue = select.value;
    const firstOption = select.options[0];
    select.replaceChildren();

    if (includeAllOption) {
      select.append(firstOption);
    } else {
      const noCategory = document.createElement('option');
      noCategory.value = '';
      noCategory.textContent = 'No category';
      select.append(noCategory);
    }

    state.categories.forEach((category) => {
      const option = document.createElement('option');
      option.value = String(category.id);
      option.textContent = category.name;
      select.append(option);
    });

    if (Array.from(select.options).some((option) => option.value === selectedValue)) {
      select.value = selectedValue;
    }
  }

  function renderCategories() {
    categoryList.replaceChildren();
    categoryCount.textContent = `${state.categories.length} ${
      state.categories.length === 1 ? 'category' : 'categories'
    }`;
    setSelectOptions(categoryFilter, true);
    setSelectOptions(dishCategory, false);

    if (state.categories.length === 0) {
      categoryList.append(
        element('p', 'menu-muted', 'No categories yet. Dishes can still be uncategorized.'),
      );
      return;
    }

    state.categories.forEach((category) => {
      const row = element('div', 'category-list__row');
      const details = element('div');
      details.append(
        element('strong', '', category.name),
        element(
          'small',
          '',
          `${category.dishCount} ${category.dishCount === 1 ? 'dish' : 'dishes'}`,
        ),
      );
      const actions = element('div', 'category-list__actions');
      const renameButton = element('button', 'menu-text-button', 'Rename');
      const deleteButton = element('button', 'menu-text-button menu-text-button--danger', 'Delete');
      renameButton.type = 'button';
      deleteButton.type = 'button';

      renameButton.addEventListener('click', async () => {
        const name = window.prompt('Rename category', category.name);
        if (name === null || name.trim() === category.name) return;

        try {
          await window.BaytnaApi.request(`/api/v1/store/categories/${category.id}`, {
            method: 'PUT',
            headers: window.BaytnaApi.csrfHeaders(),
            body: { name },
          });
          await loadCategories();
          await loadDishes();
          setMessage('Category renamed.', 'success');
        } catch (error) {
          setMessage(error.message, 'error');
        }
      });

      deleteButton.addEventListener('click', async () => {
        if (!window.confirm(`Delete the “${category.name}” category?`)) return;

        try {
          await window.BaytnaApi.request(`/api/v1/store/categories/${category.id}`, {
            method: 'DELETE',
            headers: window.BaytnaApi.csrfHeaders(),
          });
          await loadCategories();
          setMessage('Category deleted.', 'success');
        } catch (error) {
          setMessage(error.message, 'error');
        }
      });

      actions.append(renameButton, deleteButton);
      row.append(details, actions);
      categoryList.append(row);
    });
  }

  async function loadCategories() {
    const data = await window.BaytnaApi.request('/api/v1/store/categories');
    state.categories = data.categories;
    renderCategories();
  }

  function statusLabel(status) {
    return {
      active: 'Active',
      archived: 'Archived',
      draft: 'Draft',
      unavailable: 'Unavailable',
    }[status];
  }

  function createDishAction(label, className, handler) {
    const button = element('button', className, label);
    button.type = 'button';
    button.addEventListener('click', handler);
    return button;
  }

  async function changeDishStatus(dish, status) {
    clearMessage();
    try {
      await window.BaytnaApi.request(`/api/v1/store/dishes/${dish.id}`, {
        method: 'PUT',
        headers: window.BaytnaApi.csrfHeaders(),
        body: {
          categoryId: dish.categoryId,
          description: dish.description,
          name: dish.name,
          priceBaisa: dish.priceBaisa,
          status,
        },
      });
      await loadDishes();
      setMessage(`“${dish.name}” is now ${statusLabel(status).toLowerCase()}.`, 'success');
    } catch (error) {
      setMessage(error.message, 'error');
    }
  }

  async function archiveDish(dish) {
    if (
      !window.confirm(
        `Archive “${dish.name}”? It will leave the current menu and cannot be edited.`,
      )
    ) {
      return;
    }

    try {
      await window.BaytnaApi.request(`/api/v1/store/dishes/${dish.id}/archive`, {
        method: 'POST',
        headers: window.BaytnaApi.csrfHeaders(),
      });
      await Promise.all([loadCategories(), loadDishes()]);
      setMessage(`“${dish.name}” was archived.`, 'success');
    } catch (error) {
      setMessage(error.message, 'error');
    }
  }

  function renderDishes() {
    tableBody.replaceChildren();
    loading.hidden = true;
    const hasDishes = state.dishes.length > 0;
    tableWrap.hidden = !hasDishes;
    emptyState.hidden = hasDishes;

    if (!hasDishes) {
      const filtersAreActive =
        searchInput.value || categoryFilter.value || statusFilter.value !== 'all';
      emptyCopy.textContent = filtersAreActive
        ? 'Try changing the search or filters.'
        : 'Add your first dish to start building the menu.';
    }

    state.dishes.forEach((dish) => {
      const row = document.createElement('tr');
      const nameCell = document.createElement('td');
      const dishNameElement = element('strong', 'dish-table__name', dish.name);
      const description = element(
        'small',
        'dish-table__description',
        dish.description || 'No description',
      );
      nameCell.dataset.label = 'Dish';
      nameCell.append(dishNameElement, description);

      const categoryCell = element('td', '', dish.categoryName || 'Uncategorized');
      categoryCell.dataset.label = 'Category';
      const priceCell = element('td', 'dish-table__price', formatPrice(dish.priceBaisa));
      priceCell.dataset.label = 'Price';
      const statusCell = document.createElement('td');
      statusCell.dataset.label = 'Status';
      const badge = element('span', 'menu-status-badge', statusLabel(dish.status));
      badge.dataset.status = dish.status;
      statusCell.append(badge);

      const actionsCell = element('td', 'dish-table__actions');
      actionsCell.dataset.label = 'Actions';

      if (dish.status !== 'archived') {
        actionsCell.append(
          createDishAction('Edit', 'menu-text-button', () => openDishDialog(dish)),
        );

        const nextStatus = dish.status === 'active' ? 'unavailable' : 'active';
        actionsCell.append(
          createDishAction(
            dish.status === 'active' ? 'Mark unavailable' : 'Make active',
            'menu-text-button',
            () => changeDishStatus(dish, nextStatus),
          ),
          createDishAction('Archive', 'menu-text-button menu-text-button--danger', () =>
            archiveDish(dish),
          ),
        );
      }

      row.append(nameCell, categoryCell, priceCell, statusCell, actionsCell);
      tableBody.append(row);
    });

    if (state.pagination) {
      dishTotal.textContent = `${state.pagination.totalItems} ${
        state.pagination.totalItems === 1 ? 'dish' : 'dishes'
      }`;
      pageSummary.textContent = `Page ${state.pagination.page} of ${state.pagination.totalPages}`;
      previousPage.disabled = state.pagination.page <= 1;
      nextPage.disabled = state.pagination.page >= state.pagination.totalPages;
      pagination.hidden = state.pagination.totalItems <= state.pagination.pageSize;
    }
  }

  async function loadDishes() {
    loading.hidden = false;
    emptyState.hidden = true;
    tableWrap.hidden = true;

    const query = new URLSearchParams({
      page: String(state.page),
      pageSize: '10',
      sort: sortFilter.value,
      status: statusFilter.value,
    });
    if (searchInput.value.trim()) query.set('search', searchInput.value.trim());
    if (categoryFilter.value) query.set('categoryId', categoryFilter.value);

    try {
      const data = await window.BaytnaApi.request(`/api/v1/store/dishes?${query}`);
      state.dishes = data.dishes;
      state.pagination = data.pagination;
      state.page = data.pagination.page;
      renderDishes();
    } catch (error) {
      loading.hidden = true;
      setMessage(error.message, 'error');
    }
  }

  function clearDishErrors() {
    formMessage.hidden = true;
    formMessage.textContent = '';
    dishForm.querySelectorAll('.error-text').forEach((error) => {
      error.textContent = '';
    });
    dishForm.querySelectorAll('[aria-invalid="true"]').forEach((input) => {
      input.removeAttribute('aria-invalid');
    });
  }

  function showDishErrors(error) {
    const targets = {
      categoryId: ['dish-category', 'dish-category-error'],
      description: ['dish-description', 'dish-description-error'],
      name: ['dish-name', 'dish-name-error'],
      priceBaisa: ['dish-price', 'dish-price-error'],
      status: ['dish-status', 'dish-status-error'],
    };

    Object.entries(error.details || {}).forEach(([field, text]) => {
      const target = targets[field];
      if (!target) return;
      document.getElementById(target[0]).setAttribute('aria-invalid', 'true');
      document.getElementById(target[1]).textContent = text;
    });

    formMessage.textContent = error.message;
    formMessage.hidden = false;
  }

  function configureStatusOptions(dish) {
    Array.from(dishStatus.options).forEach((option) => {
      option.disabled = dish?.status === 'active' && option.value === 'draft';
    });
  }

  function openDishDialog(dish = null) {
    state.editingDish = dish;
    clearDishErrors();
    dishForm.reset();
    dialogTitle.textContent = dish ? 'Edit dish' : 'Add dish';
    saveDish.textContent = dish ? 'Save changes' : 'Add dish';
    configureStatusOptions(dish);

    if (dish) {
      dishName.value = dish.name;
      dishCategory.value = dish.categoryId ? String(dish.categoryId) : '';
      dishPrice.value = (dish.priceBaisa / 1000).toFixed(3);
      dishStatus.value = dish.status;
      dishDescription.value = dish.description;
    } else {
      dishStatus.value = 'draft';
      dishPrice.value = '';
    }

    dialog.showModal();
    dishName.focus();
  }

  function closeDishForm() {
    dialog.close();
    state.editingDish = null;
  }

  categoryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    categoryError.textContent = '';
    categoryNameInput.removeAttribute('aria-invalid');

    try {
      await window.BaytnaApi.request('/api/v1/store/categories', {
        method: 'POST',
        headers: window.BaytnaApi.csrfHeaders(),
        body: { name: categoryNameInput.value },
      });
      categoryNameInput.value = '';
      await loadCategories();
      setMessage('Category added.', 'success');
    } catch (error) {
      categoryNameInput.setAttribute('aria-invalid', 'true');
      categoryError.textContent = error.details?.name || error.message;
    }
  });

  filters.addEventListener('submit', (event) => {
    event.preventDefault();
    state.page = 1;
    loadDishes();
  });

  previousPage.addEventListener('click', () => {
    if (state.page <= 1) return;
    state.page -= 1;
    loadDishes();
  });

  nextPage.addEventListener('click', () => {
    if (!state.pagination || state.page >= state.pagination.totalPages) return;
    state.page += 1;
    loadDishes();
  });

  addDishButton.addEventListener('click', () => openDishDialog());
  emptyAddDish.addEventListener('click', () => openDishDialog());
  closeDialog.addEventListener('click', closeDishForm);
  cancelDish.addEventListener('click', closeDishForm);

  dishForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearDishErrors();
    const priceBaisa = parsePrice(dishPrice.value);

    if (priceBaisa === null) {
      dishPrice.setAttribute('aria-invalid', 'true');
      document.getElementById('dish-price-error').textContent =
        'Enter a price from 0.000 to 1,000.000 OMR.';
      return;
    }

    saveDish.disabled = true;
    saveDish.textContent = 'Saving…';

    try {
      const editing = state.editingDish;
      const endpoint = editing ? `/api/v1/store/dishes/${editing.id}` : '/api/v1/store/dishes';
      await window.BaytnaApi.request(endpoint, {
        method: editing ? 'PUT' : 'POST',
        headers: window.BaytnaApi.csrfHeaders(),
        body: {
          categoryId: dishCategory.value || null,
          description: dishDescription.value,
          name: dishName.value,
          priceBaisa,
          status: dishStatus.value,
        },
      });
      closeDishForm();
      state.page = 1;
      await Promise.all([loadCategories(), loadDishes()]);
      setMessage(editing ? 'Dish updated.' : 'Dish added.', 'success');
    } catch (error) {
      showDishErrors(error);
    } finally {
      saveDish.disabled = false;
      saveDish.textContent = state.editingDish ? 'Save changes' : 'Add dish';
    }
  });

  async function loadMenu() {
    try {
      await window.BaytnaApi.getSession();
      await loadCategories();
      await loadDishes();
    } catch (error) {
      loading.hidden = true;
      setMessage(error.message || 'Unable to load the menu.', 'error');
    }
  }

  loadMenu();
})();
