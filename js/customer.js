(function exposeBaytnaCustomer() {
  const TOKEN_KEY = 'baytnaCustomerToken';
  const USER_ID_KEY = 'baytnaCustomerUserId';
  const USER_EMAIL_KEY = 'baytnaCustomerEmail';
  const CART_KEY = 'baytnaCustomerCart';

  function parseJson(response) {
    return response.json().catch(() => {
      throw new Error('The server returned an invalid response.');
    });
  }

  async function request(path, options = {}) {
    const headers = {
      Accept: 'application/json',
      ...options.headers,
    };

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(path, {
      ...options,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
      headers,
    });

    const payload = await parseJson(response);
    if (!response.ok) {
      throw new Error(payload.message || payload.error || 'Something went wrong.');
    }

    return payload;
  }

  function decodeJwtPayload(token) {
    try {
      const encodedPayload = token.split('.')[1];
      if (!encodedPayload) return null;

      const normalized = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      return JSON.parse(atob(padded));
    } catch {
      return null;
    }
  }

  function saveSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);

    const payload = decodeJwtPayload(token) || {};
    const userId = user?.user_id ?? user?.userId ?? user?.id ?? payload.user_id ?? payload.userId ?? payload.sub;
    const email = user?.email ?? payload.email;

    if (userId !== undefined && userId !== null && userId !== '') {
      localStorage.setItem(USER_ID_KEY, String(userId));
    }

    if (email) {
      localStorage.setItem(USER_EMAIL_KEY, String(email));
    }

    if (userId !== undefined && userId !== null && userId !== '') {
      const signedInCartKey = `${CART_KEY}:${String(userId)}`;
      const guestCart = readCartFromKey(CART_KEY);
      const signedInCart = readCartFromKey(signedInCartKey);

      if (guestCart.length > 0) {
        writeCartToKey(signedInCartKey, mergeCarts(signedInCart, guestCart));
        localStorage.removeItem(CART_KEY);
      }
    }
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(USER_EMAIL_KEY);
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function getUserId() {
    const storedUserId = localStorage.getItem(USER_ID_KEY);
    if (storedUserId) return storedUserId;

    const token = getToken();
    if (!token) return '';

    const payload = decodeJwtPayload(token);
    const userId = payload?.user_id ?? payload?.userId ?? payload?.sub ?? '';
    if (userId) {
      localStorage.setItem(USER_ID_KEY, String(userId));
      return String(userId);
    }

    return '';
  }

  function getCartKey(userId = getUserId()) {
    return userId ? `${CART_KEY}:${userId}` : CART_KEY;
  }

  function readCartFromKey(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(parsed)) return [];

      return parsed
        .map((item) => {
          const listingId = Number(item.listing_id ?? item.listingId);
          const quantity = Number(item.quantity);
          const unitPrice = Number(item.unit_price ?? item.unitPrice);

          if (!Number.isInteger(listingId) || listingId <= 0) return null;
          if (!Number.isInteger(quantity) || quantity <= 0) return null;
          if (!Number.isFinite(unitPrice) || unitPrice < 0) return null;

          return {
            image: typeof item.image === 'string' ? item.image : '',
            listing_id: listingId,
            name: typeof item.name === 'string' ? item.name : 'Unknown dish',
            quantity,
            store: typeof item.store === 'string' ? item.store : '',
            unit_price: unitPrice,
          };
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  function writeCartToKey(key, cart) {
    localStorage.setItem(key, JSON.stringify(cart));
  }

  function mergeCarts(primaryCart, secondaryCart) {
    const merged = primaryCart.map((item) => ({ ...item }));

    secondaryCart.forEach((item) => {
      const existing = merged.find((entry) => entry.listing_id === item.listing_id);
      if (existing) {
        existing.quantity += item.quantity;
        existing.name = item.name || existing.name;
        existing.store = item.store || existing.store;
        existing.image = item.image || existing.image;
        existing.unit_price = item.unit_price;
        return;
      }

      merged.push({ ...item });
    });

    return merged;
  }

  async function login(email, password) {
    const response = await request('/auth/login', {
      method: 'POST',
      body: { email, password },
    });

    saveSession(response.token, response.user);
    return response;
  }

  async function signup(email, password) {
    const response = await request('/auth/signup', {
      method: 'POST',
      body: { email, password },
    });

    if (response?.user?.user_id) {
      localStorage.setItem(USER_ID_KEY, String(response.user.user_id));
    }

    if (response?.user?.email) {
      localStorage.setItem(USER_EMAIL_KEY, String(response.user.email));
    }

    return response;
  }

  function readCart() {
    const signedInCart = readCartFromKey(getCartKey());
    if (signedInCart.length > 0) {
      return signedInCart;
    }

    return readCartFromKey(CART_KEY);
  }

  function writeCart(cart) {
    writeCartToKey(getCartKey(), cart);
  }

  function addToCart(item) {
    const cart = readCart();
    const listingId = Number(item.listing_id ?? item.listingId);
    const quantity = Number(item.quantity ?? 1);
    const unitPrice = Number(item.unit_price ?? item.unitPrice);

    if (!Number.isInteger(listingId) || listingId <= 0) return;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return;

    const existing = cart.find((entry) => entry.listing_id === listingId);
    if (existing) {
      existing.quantity += Math.max(1, quantity);
      existing.name = item.name || existing.name;
      existing.store = item.store || existing.store;
      existing.unit_price = unitPrice;
      existing.image = item.image || existing.image;
    } else {
      cart.push({
        image: typeof item.image === 'string' ? item.image : '',
        listing_id: listingId,
        name: item.name || 'Unknown dish',
        quantity: Math.max(1, quantity),
        store: item.store || '',
        unit_price: unitPrice,
      });
    }

    writeCart(cart);
    return cart;
  }

  function setCartQuantity(listingId, quantity) {
    const cart = readCart();
    const targetId = Number(listingId);
    const nextQuantity = Number(quantity);
    const nextCart = cart
      .map((item) => (item.listing_id === targetId ? { ...item, quantity: nextQuantity } : item))
      .filter((item) => item.quantity > 0);
    writeCart(nextCart);
    return nextCart;
  }

  function removeFromCart(listingId) {
    const targetId = Number(listingId);
    const nextCart = readCart().filter((item) => item.listing_id !== targetId);
    writeCart(nextCart);
    return nextCart;
  }

  function clearCart() {
    localStorage.removeItem(getCartKey());
  }

  function cartTotals(cart = readCart()) {
    const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    return {
      items: cart,
      subtotal,
      total: subtotal + 1,
    };
  }

  async function createOrder() {
    const token = getToken();
    if (!token) {
      throw new Error('Please sign in before placing an order.');
    }

    const userId = getUserId();
    if (!userId) {
      throw new Error('Please sign in again before placing an order.');
    }

    const items = readCart().map((item) => ({
      listing_id: item.listing_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
    }));

    if (items.length === 0) {
      throw new Error('Your cart is empty.');
    }

    const response = await request('/orders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: {
        items,
        user_id: Number(userId),
      },
    });

    return response;
  }

  function getSavedEmail() {
    return localStorage.getItem(USER_EMAIL_KEY) || '';
  }

  window.BaytnaCustomer = {
    addToCart,
    cartTotals,
    clearCart,
    clearSession,
    createOrder,
    getSavedEmail,
    getToken,
    getUserId,
    login,
    readCart,
    removeFromCart,
    request,
    saveSession,
    setCartQuantity,
    signup,
  };
})();