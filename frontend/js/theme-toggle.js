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
    let transitioning = false;

    const updateToggle = () => {
      const isLight = root.dataset.theme === "light";
      toggle.checked = isLight;
      toggle.setAttribute("role", "switch");
      toggle.setAttribute("aria-checked", String(isLight));
      toggle.removeAttribute("aria-pressed");
      toggle.setAttribute(
        "aria-label",
        isLight ? "Switch to dark theme" : "Switch to light theme"
      );
    };

    toggle.addEventListener("change", () => {
      if (transitioning) {
        updateToggle();
        return;
      }
      const nextTheme = toggle.checked ? "light" : "dark";
      const rect = switchElement.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      root.style.setProperty("--toggle-x", `${x}px`);
      root.style.setProperty("--toggle-y", `${y}px`);
      const radius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );
      root.style.setProperty("--toggle-radius", `${Math.ceil(radius)}px`);

      const applyTheme = () => {
        root.dataset.theme = nextTheme;
        try {
          localStorage.setItem("theme", nextTheme);
        } catch {
          // Theme still applies when storage is unavailable.
        }
        updateToggle();
      };

      if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        const restoreScroll = () => {
          window.scrollTo({
            left: scrollX,
            top: scrollY,
            behavior: "instant"
          });
        };
        try {
          transitioning = true;
          root.dataset.themeTransition = nextTheme;
          const transition = document.startViewTransition(applyTheme);
          transition.ready.then(restoreScroll, () => {});
          const finish = () => {
            transitioning = false;
            delete root.dataset.themeTransition;
            restoreScroll();
          };
          transition.finished.then(finish, () => {
            applyTheme();
            finish();
          });
        } catch {
          transitioning = false;
          delete root.dataset.themeTransition;
          applyTheme();
        }
      } else {
        applyTheme();
      }
    });

    updateToggle();
  });
})();
