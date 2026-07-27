/**
 * Builds the HTML for one dish card.
 * dish = { id, name, store, price, image, category, isAvailable, link }
 * `link`, if set, makes the whole card open that URL (e.g. dish-detail.html)
 * while leaving "Add to cart" clickable on its own.
 *
 * Usage: loop over an array of dishes and join the results into a
 * container (e.g. an element with the .grid class):
 *   grid.innerHTML = dishes.map(createDishCard).join('');
 */
function createDishCard(dish) {
  const { id, name, store, price, image, category, isAvailable, link } = dish;

  const photo = image
    ? `<img class="dish-card__photo" src="${escapeHtml(image)}" alt="${escapeHtml(name)}">`
    : '';

  const linkOverlay = link
    ? `<a class="dish-card__link-overlay" href="${escapeHtml(link)}" aria-label="View ${escapeHtml(name)}"></a>`
    : '';

  const priceLabel = `${Number(price).toFixed(3)} OMR`;

  const action = isAvailable
    ? `<button type="button" class="btn-primary dish-card__action">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="9" cy="21" r="1"></circle>
          <circle cx="20" cy="21" r="1"></circle>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
        Add to cart
      </button>`
    : `<p class="dish-card__sold-out">Sold out today</p>`;

  return `
    <article class="card dish-card${isAvailable ? '' : ' dish-card--unavailable'}" data-dish-id="${escapeHtml(String(id))}" data-category="${escapeHtml(String(category))}">
      ${linkOverlay}
      <div class="dish-card__photo-wrap">
        ${photo}
        <span class="badge dish-card__badge">Homemade</span>
      </div>
      <div class="dish-card__body">
        <p class="dish-card__name">${escapeHtml(name)}</p>
        <p class="dish-card__store">from ${escapeHtml(store)}</p>
        <p class="dish-card__price">${priceLabel}</p>
        ${action}
      </div>
    </article>
  `;
}

/** Escapes text pulled from dish data before it's dropped into HTML (dish/store names come from home stores, so treat them as untrusted input). */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
