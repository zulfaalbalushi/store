(function initializeOrders() {
  const filters = document.getElementById('order-filters');
  if (!filters) return;

  const state = { page: 1, pagination: null, selectedOrder: null };
  const search = document.getElementById('order-search');
  const statusFilter = document.getElementById('order-status');
  const dateFrom = document.getElementById('order-date-from');
  const dateTo = document.getElementById('order-date-to');
  const sort = document.getElementById('order-sort');
  const message = document.getElementById('orders-message');
  const total = document.getElementById('orders-total');
  const loading = document.getElementById('orders-loading');
  const empty = document.getElementById('orders-empty');
  const tableWrap = document.getElementById('order-table-wrap');
  const tableBody = document.getElementById('order-table-body');
  const pagination = document.getElementById('orders-pagination');
  const previous = document.getElementById('orders-previous');
  const next = document.getElementById('orders-next');
  const pageSummary = document.getElementById('orders-page-summary');
  const dialog = document.getElementById('order-dialog');
  const dialogTitle = document.getElementById('order-dialog-title');
  const closeDialog = document.getElementById('close-order-dialog');
  const detailLoading = document.getElementById('order-detail-loading');
  const detail = document.getElementById('order-detail');
  const detailStatus = document.getElementById('order-detail-status');
  const detailCreated = document.getElementById('order-detail-created');
  const customer = document.getElementById('order-customer');
  const items = document.getElementById('order-items');
  const totals = document.getElementById('order-totals');
  const history = document.getElementById('order-history');
  const actions = document.getElementById('order-actions');

  function element(tag, className, text) {
    const created = document.createElement(tag);
    if (className) created.className = className;
    if (text !== undefined) created.textContent = text;
    return created;
  }

  function showMessage(text, type = 'error') {
    message.textContent = text;
    message.className = `business-alert business-alert--${type}`;
    message.hidden = false;
  }

  function clearMessage() {
    message.hidden = true;
    message.textContent = '';
  }

  function formatMoney(baisa) {
    return `${(baisa / 1000).toFixed(3)} OMR`;
  }

  function parseTimestamp(value) {
    if (!value) return null;
    const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value) {
    const date = parseTimestamp(value);
    if (!date) return 'Not available';
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  function labelStatus(status) {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  function statusBadge(status) {
    const badge = element('span', 'order-status-badge', labelStatus(status));
    badge.dataset.status = status;
    return badge;
  }

  async function openOrder(orderId) {
    detail.hidden = true;
    detailLoading.hidden = false;
    dialogTitle.textContent = 'Order';
    if (!dialog.open) dialog.showModal();

    try {
      const data = await window.BaytnaApi.request(`/api/v1/store/orders/${orderId}`);
      state.selectedOrder = data.order;
      renderOrderDetails(data.order);
    } catch (error) {
      dialog.close();
      showMessage(error.message);
    }
  }

  function renderOrders(orders) {
    tableBody.replaceChildren();

    orders.forEach((order) => {
      const row = document.createElement('tr');
      const orderCell = element('td');
      orderCell.dataset.label = 'Order';
      orderCell.append(element('strong', '', order.orderNumber));
      const customerCell = element('td', '', order.customerName);
      customerCell.dataset.label = 'Customer';
      const createdCell = element('td', '', formatDate(order.createdAt));
      createdCell.dataset.label = 'Placed';
      const itemCell = element(
        'td',
        '',
        `${order.itemCount} ${order.itemCount === 1 ? 'item' : 'items'}`,
      );
      itemCell.dataset.label = 'Items';
      const totalCell = element('td', '', formatMoney(order.totalBaisa));
      totalCell.dataset.label = 'Total';
      const statusCell = element('td');
      statusCell.dataset.label = 'Status';
      statusCell.append(statusBadge(order.status));
      const actionCell = element('td', 'order-table__action');
      const view = element('button', 'btn-secondary', 'View');
      view.type = 'button';
      view.addEventListener('click', () => openOrder(order.id));
      actionCell.append(view);
      row.append(orderCell, customerCell, createdCell, itemCell, totalCell, statusCell, actionCell);
      tableBody.append(row);
    });
  }

  function queryString() {
    const query = new URLSearchParams({
      page: String(state.page),
      pageSize: '10',
      sort: sort.value,
      status: statusFilter.value,
    });
    if (search.value.trim()) query.set('search', search.value.trim());
    if (dateFrom.value) query.set('dateFrom', dateFrom.value);
    if (dateTo.value) query.set('dateTo', dateTo.value);
    return query;
  }

  async function loadOrders() {
    clearMessage();
    loading.hidden = false;
    empty.hidden = true;
    tableWrap.hidden = true;
    pagination.hidden = true;

    try {
      const data = await window.BaytnaApi.request(`/api/v1/store/orders?${queryString()}`);
      state.pagination = data.pagination;
      state.page = data.pagination.page;
      total.textContent = `${data.pagination.totalItems} ${
        data.pagination.totalItems === 1 ? 'order' : 'orders'
      }`;
      loading.hidden = true;

      if (data.orders.length === 0) {
        empty.hidden = false;
        return;
      }

      renderOrders(data.orders);
      tableWrap.hidden = false;
      pageSummary.textContent = `Page ${data.pagination.page} of ${data.pagination.totalPages}`;
      previous.disabled = data.pagination.page <= 1;
      next.disabled = data.pagination.page >= data.pagination.totalPages;
      pagination.hidden = data.pagination.totalPages <= 1;
    } catch (error) {
      loading.hidden = true;
      total.textContent = 'Orders unavailable';
      showMessage(error.message);
    }
  }

  function appendDefinition(list, term, description) {
    list.append(element('dt', '', term), element('dd', '', description || 'Not provided'));
  }

  function renderItems(order) {
    items.replaceChildren();
    order.items.forEach((item) => {
      const row = element('div', 'order-item');
      const description = element('div');
      description.append(
        element('strong', '', item.dishName),
        element('small', '', `${item.quantity} × ${formatMoney(item.unitPriceBaisa)}`),
      );
      row.append(description, element('span', '', formatMoney(item.lineTotalBaisa)));
      items.append(row);
    });

    totals.replaceChildren();
    appendDefinition(totals, 'Subtotal', formatMoney(order.subtotalBaisa));
    appendDefinition(totals, 'Delivery', formatMoney(order.deliveryFeeBaisa));
    appendDefinition(totals, 'Total', formatMoney(order.totalBaisa));
  }

  function renderHistory(order) {
    history.replaceChildren();
    if (order.history.length === 0) {
      history.append(element('li', 'order-history__empty', 'No status changes yet.'));
      return;
    }

    order.history.forEach((entry) => {
      const item = element('li');
      const transition = entry.fromStatus
        ? `${labelStatus(entry.fromStatus)} → ${labelStatus(entry.toStatus)}`
        : labelStatus(entry.toStatus);
      item.append(
        element('strong', '', transition),
        element(
          'small',
          '',
          `${formatDate(entry.createdAt)}${entry.changedBy ? ` · ${entry.changedBy}` : ''}`,
        ),
      );
      if (entry.reason) item.append(element('p', '', entry.reason));
      history.append(item);
    });
  }

  const transitions = {
    pending: [
      ['Accept order', 'accepted', 'btn-primary'],
      ['Reject order', 'rejected', 'btn-secondary'],
    ],
    accepted: [
      ['Start preparing', 'preparing', 'btn-primary'],
      ['Cancel order', 'cancelled', 'btn-secondary'],
    ],
    preparing: [
      ['Mark ready', 'ready', 'btn-primary'],
      ['Cancel order', 'cancelled', 'btn-secondary'],
    ],
    ready: [['Complete order', 'completed', 'btn-primary']],
  };

  async function changeStatus(targetStatus) {
    const requiresReason = ['rejected', 'cancelled'].includes(targetStatus);
    let reason = '';

    if (requiresReason) {
      reason = window.prompt(`Reason for marking this order ${targetStatus}:`) ?? '';
      if (!reason) return;
    } else if (!window.confirm(`Mark this order as ${targetStatus}?`)) {
      return;
    }

    actions.querySelectorAll('button').forEach((button) => {
      button.disabled = true;
    });

    try {
      const data = await window.BaytnaApi.request(
        `/api/v1/store/orders/${state.selectedOrder.id}/status`,
        {
          method: 'POST',
          headers: window.BaytnaApi.csrfHeaders(),
          body: { reason, status: targetStatus },
        },
      );
      state.selectedOrder = data.order;
      renderOrderDetails(data.order);
      await loadOrders();
      showMessage(
        `Order ${data.order.orderNumber} is now ${labelStatus(targetStatus)}.`,
        'success',
      );
    } catch (error) {
      showMessage(error.message);
      renderActions(state.selectedOrder);
    }
  }

  function renderActions(order) {
    actions.replaceChildren();
    (transitions[order.status] || []).forEach(([label, targetStatus, className]) => {
      const button = element('button', className, label);
      button.type = 'button';
      button.addEventListener('click', () => changeStatus(targetStatus));
      actions.append(button);
    });
  }

  function renderOrderDetails(order) {
    dialogTitle.textContent = `Order ${order.orderNumber}`;
    detailStatus.textContent = labelStatus(order.status);
    detailStatus.dataset.status = order.status;
    detailCreated.textContent = formatDate(order.createdAt);
    customer.replaceChildren();
    appendDefinition(customer, 'Name', order.customer.name);
    appendDefinition(customer, 'Phone', order.customer.phone);
    appendDefinition(customer, 'Delivery address', order.customer.deliveryAddress);
    renderItems(order);
    renderHistory(order);
    renderActions(order);
    detailLoading.hidden = true;
    detail.hidden = false;
  }

  filters.addEventListener('submit', (event) => {
    event.preventDefault();
    state.page = 1;
    loadOrders();
  });
  previous.addEventListener('click', () => {
    state.page -= 1;
    loadOrders();
  });
  next.addEventListener('click', () => {
    state.page += 1;
    loadOrders();
  });
  closeDialog.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  window.BaytnaApi.getSession()
    .then(loadOrders)
    .catch(() => {});
})();
