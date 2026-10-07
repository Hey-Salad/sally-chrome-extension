const {
  detectStoreFromUrl,
  isSupportedSupermarketUrl,
  resolveShoppingStore,
} = require('../shared/store-routing.js');

describe('store routing', () => {
  test('detects supported supermarket URLs', () => {
    expect(detectStoreFromUrl('https://www.tesco.com/groceries/en-GB/search?query=milk')).toBe('tesco');
    expect(detectStoreFromUrl('https://www.waitrose.com/ecom/shop/search?searchTerm=milk')).toBe('waitrose');
    expect(detectStoreFromUrl('https://groceries.morrisons.com/search?q=milk')).toBe('morrisons');
    expect(detectStoreFromUrl('https://www.aldi.co.uk/search?q=milk')).toBe('aldi');
    expect(detectStoreFromUrl('https://example.com')).toBeNull();
  });

  test('flags only supported supermarket URLs as valid for reinjection', () => {
    expect(isSupportedSupermarketUrl('https://www.ocado.com/search?q=milk')).toBe(true);
    expect(isSupportedSupermarketUrl('https://groceries.asda.com/search/milk')).toBe(true);
    expect(isSupportedSupermarketUrl('https://heysalad.app')).toBe(false);
  });

  test('navigates when requested and detected stores differ', () => {
    const result = resolveShoppingStore({
      requestedStore: 'waitrose',
      detectedStore: 'tesco',
    });

    expect(result.finalStore).toBe('waitrose');
    expect(result.shouldNavigateToStore).toBe(true);
    expect(result.hasStoreMismatch).toBe(true);
  });

  test('does not navigate when already on the requested store', () => {
    const result = resolveShoppingStore({
      requestedStore: 'tesco',
      detectedStore: 'tesco',
    });

    expect(result.finalStore).toBe('tesco');
    expect(result.shouldNavigateToStore).toBe(false);
    expect(result.hasStoreMismatch).toBe(false);
  });

  test('does not guess a store when no store is available yet', () => {
    const result = resolveShoppingStore({});

    expect(result.finalStore).toBeNull();
    expect(result.shouldNavigateToStore).toBe(false);
  });
});
