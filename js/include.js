/**
 * Partial include system.
 * Loads shared HTML fragments (navbar, footer) into a page at runtime,
 * so they don't have to be copy-pasted into every page.
 *
 * Usage in a page:
 *   <body>
 *     <div data-include="/pages/partials/navbar.html"></div>
 *
 *     ...page content...
 *
 *     <div data-include="/pages/partials/footer.html"></div>
 *     <script src="/js/include.js" defer></script>
 *   </body>
 *
 * Needs to be served over http(s) — with Live Server this works as-is,
 * but fetch() will fail if a page is opened directly via a file:// path.
 */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-include]').forEach(async (el) => {
    const path = el.getAttribute('data-include');
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`${path} responded with ${response.status}`);
      }
      el.outerHTML = await response.text();
    } catch (err) {
      console.error('Failed to load partial:', err);
    }
  });
});
