(function attachStoreRouting(root, factory) {
  const api = factory();

  root.HeySaladStoreRouting = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildStoreRoutingApi() {
  const STORE_PATTERNS = [
    { store: 'tesco', patterns: ['tesco.com'] },
    { store: 'sainsburys', patterns: ['sainsburys.co.uk'] },
    { store: 'asda', patterns: ['asda.com'] },
    { store: 'ocado', patterns: ['ocado.com'] },
    { store: 'waitrose', patterns: ['waitrose.com'] },
    { store: 'morrisons', patterns: ['morrisons.com'] },
    { store: 'aldi', patterns: ['aldi.co.uk'] },
  ];

  function normalizeStoreName(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized || null;
  }

  function detectStoreFromUrl(url) {
    const normalizedUrl = String(url || '').toLowerCase();

    if (!normalizedUrl) {
      return null;
    }

    const match = STORE_PATTERNS.find(({ patterns }) => {
      return patterns.some((pattern) => normalizedUrl.includes(pattern));
    });

    return match?.store || null;
  }

  function isSupportedSupermarketUrl(url) {
    return Boolean(detectStoreFromUrl(url));
  }

  function resolveShoppingStore({ requestedStore, detectedStore } = {}) {
    const normalizedRequestedStore = normalizeStoreName(requestedStore);
    const normalizedDetectedStore = normalizeStoreName(detectedStore);
    const finalStore = normalizedRequestedStore || normalizedDetectedStore || null;
    const shouldNavigateToStore = Boolean(finalStore) && (!normalizedDetectedStore ||
      (Boolean(normalizedRequestedStore) && normalizedRequestedStore !== normalizedDetectedStore));

    return {
      requestedStore: normalizedRequestedStore,
      detectedStore: normalizedDetectedStore,
      finalStore,
      shouldNavigateToStore,
      hasStoreMismatch: Boolean(normalizedRequestedStore && normalizedDetectedStore && normalizedRequestedStore !== normalizedDetectedStore),
    };
  }

  return {
    detectStoreFromUrl,
    isSupportedSupermarketUrl,
    normalizeStoreName,
    resolveShoppingStore,
  };
});
