(async function initializeStorePortal() {
  const email = document.getElementById('store-user-email');
  const signout = document.getElementById('store-signout');
  const menuButton = document.getElementById('store-menu-button');
  const sidebar = document.getElementById('store-sidebar');

  try {
    const session = await window.BaytnaApi.getSession();
    email.textContent = session.account.email;
  } catch {
    window.BaytnaApi.clearSession();
    window.location.replace('/');
    return;
  }

  signout.addEventListener('click', async () => {
    signout.disabled = true;
    try {
      await window.BaytnaApi.request('/api/v1/auth/sign-out', {
        method: 'POST',
        headers: window.BaytnaApi.csrfHeaders(),
      });
    } finally {
      window.BaytnaApi.clearSession();
      window.location.replace('/');
    }
  });

  menuButton.addEventListener('click', () => {
    const isOpen = sidebar.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
  });
})();
