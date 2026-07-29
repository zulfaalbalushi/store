(function initializeStoreTheme() {
  const preferenceKey = 'baytnaStoreTheme';

  function savedTheme() {
    try {
      return localStorage.getItem(preferenceKey) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  function applyTheme(theme) {
    document.documentElement.dataset.storeTheme = theme;
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(preferenceKey, theme);
    } catch {
      // The current page still receives the selected theme when storage is unavailable.
    }
    applyTheme(theme);
  }

  function updateToggle(toggle, theme) {
    const enabled = theme === 'dark';
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.textContent = `Dark mode: ${enabled ? 'On' : 'Off'}`;
  }

  applyTheme(savedTheme());

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('dark-mode-toggle');
    if (!toggle) return;

    updateToggle(toggle, document.documentElement.dataset.storeTheme);
    toggle.addEventListener('click', () => {
      const theme = document.documentElement.dataset.storeTheme === 'dark' ? 'light' : 'dark';
      saveTheme(theme);
      updateToggle(toggle, theme);
    });
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== preferenceKey) return;
    const theme = savedTheme();
    applyTheme(theme);
    const toggle = document.getElementById('dark-mode-toggle');
    if (toggle) updateToggle(toggle, theme);
  });
})();
