const {
  extractProductAttributes,
  chooseBestProductByFit,
  scoreProductFit,
} = require('../shared/product-fit.js');

describe('product fit heuristics', () => {
  test('extracts pack and measure attributes from product names', () => {
    expect(extractProductAttributes('Tesco Luxury Soft White Toilet Tissue 6 Long Rolls', 3.4)).toMatchObject({
      packageCount: 6,
      packageUnit: 'rolls',
      price: 3.4,
    });

    expect(extractProductAttributes('Tesco 5% Fat Beef Mince 500G', 4.25)).toMatchObject({
      measureType: 'weight',
      measureUnit: 'g',
      measureValue: 500,
      price: 4.25,
    });
  });

  test('prefers the requested mince size when a weight is present', () => {
    const requestedItem = {
      name: 'Beef mince 500g',
      searchQuery: 'Beef mince 500g',
      quantity: 1,
      requestedSize: {
        value: 500,
        unit: 'g',
        label: '500g',
        kind: 'measure',
      },
    };

    const products = [
      { name: 'Tesco 5% Fat Beef Mince 750G', price: 5.75 },
      { name: 'Tesco 5% Fat Beef Mince 500G', price: 4.25 },
      { name: 'Tesco Finest Beef Burgers 400G', price: 4.75 },
    ];

    const best = chooseBestProductByFit(requestedItem, products);
    expect(best).toMatchObject({ success: true, bestIndex: 1 });
  });

  test('penalizes oversized household paper packs when no bulk size was requested', () => {
    const requestedItem = {
      name: 'Toilet paper',
      searchQuery: 'Toilet paper',
      quantity: 2,
      requestedSize: null,
    };

    const products = [
      { name: 'Who Gives A Crap Extra Soft Toilet Tissue 12 Mega Rolls', price: 12.25 },
      { name: 'Tesco Luxury Soft White Toilet Tissue 6 Long Rolls', price: 3.40 },
      { name: 'Andrex Complete Clean Toilet Tissue Mega Rolls 12 Pack', price: 11.75 },
    ];

    const bulkScore = scoreProductFit(requestedItem, products[0], products);
    const normalScore = scoreProductFit(requestedItem, products[1], products);
    const best = chooseBestProductByFit(requestedItem, products);

    expect(normalScore).toBeGreaterThan(bulkScore);
    expect(best).toMatchObject({ success: true, bestIndex: 1 });
  });
});
