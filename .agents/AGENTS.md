# Project-specific Guidelines

## 1. Safe Initialization in Vanilla JS (ES Modules)
Because ES6 modules execute deferred, `DOMContentLoaded` or `window.onload` events might have already fired by the time the script executes. 
* **DOMContentLoaded Guard**: Never wrap initialization code solely in a `DOMContentLoaded` event listener. Always check the document's state:
  ```javascript
  function init() {
      // Initialization code here...
  }

  if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
  } else {
      init();
  }
  ```
* **Asynchronous CDNs**: Do not rely on `window.onload` to wait for asynchronous external scripts (like Google GIS Client or Lucide). Check for the global namespace immediately, and fall back to a polling interval if it's not yet loaded:
  ```javascript
  if (typeof google !== 'undefined') {
      setup();
  } else {
      const interval = setInterval(() => {
          if (typeof google !== 'undefined') {
              clearInterval(interval);
              setup();
          }
      }, 100);
      setTimeout(() => clearInterval(interval), 10000); // 10s timeout guard
  }
  ```

## 2. Refactoring & Initialization Integrity
When splitting monolithic modules into smaller focused files (like separating Studio Rent from MZO Invoicing):
* **Bootstrap Check**: Always ensure the new module's initialization function (e.g. `initStudioInvoices()`) is called from the main module's bootstrap routine.
* **Relative Import Paths**: Verify that relative import paths (e.g. `../api/` vs `./`) are adjusted correctly relative to the new file's directory location.
