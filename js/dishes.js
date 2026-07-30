(function () {
  const grid = document.getElementById('dish-grid');
  const emptyState = document.getElementById('dish-empty');
  const searchInput = document.getElementById('dish-search');
  const categoryChips = document.querySelectorAll('.area-filters .chip');
  const state = {
    listings: [],
  };

  // Tracks which chip is selected; "All" skips the category check entirely.
  let activeCategory = 'All';

  function formatListingCard(listing) {
    return {
      category: 'All',
      id: listing.listing_id,
      image: listing.image_url,
      isAvailable: true,
      link: `/pages/dish-detail.html?listing_id=${encodeURIComponent(listing.listing_id)}`,
      name: listing.listing_name,
      price: listing.price,
      store: listing.store_name,
    };
  }

  function renderGrid() {
    const query = searchInput.value.trim().toLowerCase();

    const filtered = state.listings.filter((listing) => {
      const name = String(listing.listing_name || '').toLowerCase();
      const store = String(listing.store_name || '').toLowerCase();
      const matchesQuery = name.includes(query) || store.includes(query);
      return activeCategory === 'All' && matchesQuery;
    });

    if (filtered.length === 0) {
      grid.innerHTML = '';
      emptyState.textContent = state.listings.length === 0
        ? 'No dishes are available right now.'
        : 'No dishes found. Try a different search.';
      emptyState.hidden = false;
    } else {
      grid.innerHTML = filtered.map((listing) => createDishCard(formatListingCard(listing))).join('');
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

  grid.addEventListener('click', (event) => {
    const button = event.target.closest('.dish-card__action');
    if (!button) return;

    const card = button.closest('.dish-card');
    if (!card) return;

    const listing = state.listings.find((entry) => String(entry.listing_id) === card.dataset.dishId);
    if (!listing || !window.BaytnaCustomer) return;

    window.BaytnaCustomer.addToCart({
      image: listing.image_url,
      listing_id: listing.listing_id,
      name: listing.listing_name,
      quantity: 1,
      store: listing.store_name,
      unit_price: listing.price,
    });

    const previousLabel = button.textContent;
    button.textContent = 'Added ✓';
    setTimeout(() => {
      button.textContent = previousLabel;
    }, 1000);
  });

  async function loadListings() {
    try {
      const listings = await window.BaytnaCustomer.request('/listings');
      state.listings = Array.isArray(listings) ? listings : [];
      renderGrid();
    } catch (error) {
      state.listings = [];
      emptyState.textContent = error.message || 'Unable to load dishes right now.';
      grid.innerHTML = '';
      emptyState.hidden = false;
    }
  }

  loadListings();
})();
