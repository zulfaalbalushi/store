/**
 * Dishes catalog page (pages/dishes.html).
 * Renders the full dish grid from sampleDishes (js/sampleDishes.js) via
 * createDishCard() (js/dishCard.js), and keeps it in sync with the
 * category chips + search box.
 *
 * Category and search filters combine with AND: a dish must match the
 * active category chip AND contain the search text in its name to stay
 * visible (e.g. "Sweets" chip + typing "hal" only shows sweet dishes
 * whose name contains "hal").
 */
(function () {
  const grid = document.getElementById('dish-grid');
  const emptyState = document.getElementById('dish-empty');
  const searchInput = document.getElementById('dish-search');
  const categoryChips = document.querySelectorAll('.area-filters .chip');

  // Tracks which chip is selected; "All" skips the category check entirely.
  let activeCategory = 'All';

  function renderGrid() {
    const query = searchInput.value.trim().toLowerCase();

    const filtered = sampleDishes.filter((dish) => {
      const matchesCategory = activeCategory === 'All' || dish.category === activeCategory;
      const matchesQuery = dish.name.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });

    if (filtered.length === 0) {
      grid.innerHTML = '';
      emptyState.hidden = false;
    } else {
      grid.innerHTML = filtered.map(createDishCard).join('');
      emptyState.hidden = true;
    }
  }

  // Search box: re-filter on every keystroke.
  searchInput.addEventListener('input', renderGrid);

  // Category chips: only one active at a time, click swaps the .active
  // class and updates the category filter used by renderGrid().
  categoryChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      categoryChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      activeCategory = chip.dataset.category;
      renderGrid();
    });
  });

  renderGrid();
})();
