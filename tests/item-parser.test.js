const {
  parseShoppingLine,
  parseItems,
  getItemSearchQuery,
  normalizeShoppingItem,
} = require('../shared/item-parser.js');

describe('item parser', () => {
  test('parses explicit count prefixes as quantities', () => {
    expect(parseShoppingLine('2x Toilet paper')).toMatchObject({
      name: 'Toilet paper',
      quantity: 2,
      searchQuery: 'Toilet paper',
    });

    expect(parseShoppingLine('Eggs x3')).toMatchObject({
      name: 'Eggs',
      quantity: 3,
      searchQuery: 'Eggs',
    });
  });

  test('keeps weights as search intent instead of treating them as item count', () => {
    expect(parseShoppingLine('500g Beef mince')).toMatchObject({
      name: 'Beef mince 500g',
      quantity: 1,
      searchQuery: 'Beef mince 500g',
      requestedSize: {
        value: 500,
        unit: 'g',
        label: '500g',
        kind: 'measure',
      },
    });

    expect(parseShoppingLine('Milk 2L')).toMatchObject({
      name: 'Milk 2L',
      quantity: 1,
      searchQuery: 'Milk 2L',
      requestedSize: {
        value: 2,
        unit: 'l',
        label: '2L',
        kind: 'measure',
      },
    });
  });

  test('keeps package-size hints in the search query', () => {
    expect(parseShoppingLine('12 pack eggs')).toMatchObject({
      name: 'eggs 12 pack',
      quantity: 1,
      searchQuery: 'eggs 12 pack',
      requestedSize: {
        value: 12,
        unit: 'pack',
        label: '12 pack',
        kind: 'package',
      },
    });

    expect(parseShoppingLine('toilet tissue 6 rolls')).toMatchObject({
      name: 'toilet tissue 6 rolls',
      quantity: 1,
      searchQuery: 'toilet tissue 6 rolls',
      requestedSize: {
        value: 6,
        unit: 'rolls',
        label: '6 rolls',
        kind: 'package',
      },
    });
  });

  test('does not misread product descriptors as quantity', () => {
    expect(parseShoppingLine('2 ply toilet paper')).toMatchObject({
      name: '2 ply toilet paper',
      quantity: 1,
      searchQuery: '2 ply toilet paper',
      requestedSize: null,
    });
  });

  test('parses multiline lists and normalizes object inputs', () => {
    expect(parseItems('2x Toilet paper\nPaper towels\n3x Eggs')).toEqual([
      expect.objectContaining({ name: 'Toilet paper', quantity: 2 }),
      expect.objectContaining({ name: 'Paper towels', quantity: 1 }),
      expect.objectContaining({ name: 'Eggs', quantity: 3 }),
    ]);

    expect(normalizeShoppingItem({ name: ' 500g Beef mince ', quantity: 2 })).toMatchObject({
      name: '500g Beef mince',
      quantity: 2,
      searchQuery: 'Beef mince 500g',
    });
  });

  test('returns the best available search query for an item', () => {
    expect(getItemSearchQuery({ name: 'Eggs', searchQuery: 'free range eggs 12 pack' })).toBe('free range eggs 12 pack');
    expect(getItemSearchQuery('3x Eggs')).toBe('Eggs');
  });
});
