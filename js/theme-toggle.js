(function () {
  const root = document.documentElement;

  try {
    const savedTheme = localStorage.getItem("theme");
    root.dataset.theme = savedTheme === "light" ? "light" : "dark";
  } catch {
    root.dataset.theme = "dark";
  }

  document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.querySelector(".theme-toggle input");
    const switchElement = document.querySelector(".theme-toggle");
    if (!toggle || !switchElement) return;

    const updateToggle = () => {
      const isLight = root.dataset.theme === "light";
      toggle.checked = isLight;
      toggle.setAttribute("aria-pressed", String(isLight));
      toggle.setAttribute(
        "aria-label",
        isLight ? "Switch to dark theme" : "Switch to light theme"
      );
    };

    toggle.addEventListener("change", () => {
      const nextTheme = toggle.checked ? "light" : "dark";
      const rect = switchElement.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      root.style.setProperty("--toggle-x", `${x}px`);
      root.style.setProperty("--toggle-y", `${y}px`);

      const applyTheme = () => {
        root.dataset.theme = nextTheme;
        try {
          localStorage.setItem("theme", nextTheme);
        } catch {
          // Theme still applies when storage is unavailable.
        }
        updateToggle();
      };

      if (document.startViewTransition) {
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        const transition = document.startViewTransition(applyTheme);
        transition.ready.then(() => {
          window.scrollTo({
            left: scrollX,
            top: scrollY,
            behavior: "instant"
          });
        });
        transition.finished.finally(() => {
          window.scrollTo({
            left: scrollX,
            top: scrollY,
            behavior: "instant"
          });
        });
      } else {
        applyTheme();
      }
    });

    updateToggle();
  });
})();
