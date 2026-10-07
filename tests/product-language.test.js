const {
  normalizeSemanticText,
  getPreferredSearchQuery,
  getSearchQueryVariants,
  getObviousMismatchReason,
} = require('../shared/product-language.js');

describe('product language helper', () => {
  test('normalizes toilet paper requests to toilet tissue', () => {
    expect(normalizeSemanticText('Toilet paper')).toBe('toilet tissue');
    expect(normalizeSemanticText('Loo rolls')).toBe('toilet tissue');
  });

  test('normalizes paper towels to kitchen roll', () => {
    expect(normalizeSemanticText('Paper towels')).toBe('kitchen roll');
    expect(getPreferredSearchQuery('Paper towels')).toBe('kitchen roll');
  });

  test('preserves useful qualifiers in the preferred search query', () => {
    expect(getPreferredSearchQuery('2 ply toilet paper')).toBe('2 ply toilet tissue');
  });

  test('preserves M&S brand syntax for supermarket search', () => {
    expect(getPreferredSearchQuery('M&S Sunflower Oil, 1L')).toBe('M&S Sunflower Oil 1L');
    expect(getPreferredSearchQuery('m and s sunflower oil 1l')).toBe('M&S sunflower oil 1l');
  });

  test('searches broad product terms before exact branded basket items', () => {
    expect(getSearchQueryVariants('M&S Sunflower Oil, 1L')).toEqual([
      'Sunflower Oil',
      'Sunflower Oil 1L',
      'M&S Sunflower Oil 1L',
      'M&S Sunflower Oil',
    ]);
  });

  test('uses generic grocery names for brand-heavy Ocado basket lines', () => {
    expect(getSearchQueryVariants('Tilda Easy Cook Long Grain Rice, 500g')).toEqual([
      'long grain rice',
      'long grain rice 500g',
      'tilda easy cook long grain rice 500g',
      'easy cook long grain rice 500g',
      'tilda easy cook long grain rice',
      'easy cook long grain rice',
    ]);

    expect(getSearchQueryVariants('M&S Sultana Bran Flakes, 500g')[0]).toBe('Sultana Bran Flakes');
  });

  test('flags obvious non-fresh egg matches', () => {
    expect(getObviousMismatchReason('Eggs', 'Cadbury Mini Eggs Shell Egg 95g')).toContain('mini egg');
    expect(getObviousMismatchReason('Eggs', 'Tesco Egg Custard Tarts 4 Pack')).toContain('custard');
    expect(getObviousMismatchReason('Eggs', 'Tesco Large Free Range Eggs 12 Pack')).toBeNull();
  });
});
