// Match each query independently, including breakpoint changes during a test.
exports.installMedia = (window, width = 1440, reducedMotion = true) => {
  const queries = new Map();
  function matches(query) {
    if (query.includes('prefers-reduced-motion')) return reducedMotion;
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    return (!max || width <= Number(max[1])) && (!min || width >= Number(min[1]));
  }
  window.matchMedia = query => {
    if (!queries.has(query)) {
      const media = new window.EventTarget();
      media.media = query;
      media.matches = matches(query);
      queries.set(query, media);
    }
    return queries.get(query);
  };
  return nextWidth => {
    width = nextWidth;
    for (const [query, media] of queries) {
      const next = matches(query);
      if (next !== media.matches) {
        media.matches = next;
        media.dispatchEvent(new window.Event('change'));
      }
    }
  };
};
