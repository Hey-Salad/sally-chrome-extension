const {
  computeTaskMetrics,
  formatProgressSummary,
  getProgressPercentage,
} = require('../shared/task-metrics.js');

describe('task metrics helper', () => {
  test('tracks added, failed, and remaining items with quantity awareness', () => {
    const task = {
      items: [
        { name: 'Milk', quantity: 2, status: 'added' },
        { name: 'Bread', quantity: 1, status: 'failed' },
        { name: 'Eggs', quantity: 3, status: 'pending' },
        { name: 'Butter', quantity: 1, status: 'searching' },
      ],
    };

    const metrics = computeTaskMetrics(task);

    expect(metrics.totalItems).toBe(4);
    expect(metrics.addedItems).toBe(1);
    expect(metrics.failedItems).toBe(1);
    expect(metrics.remainingItems).toBe(2);
    expect(metrics.totalUnits).toBe(7);
    expect(metrics.addedUnits).toBe(2);
    expect(metrics.failedUnits).toBe(1);
    expect(metrics.remainingUnits).toBe(4);
    expect(metrics.hasMultiQuantity).toBe(true);
  });

  test('formats a progress summary the user can read while shopping', () => {
    const summary = formatProgressSummary({
      items: [
        { name: 'Milk', quantity: 2, status: 'added' },
        { name: 'Bread', quantity: 1, status: 'failed' },
        { name: 'Eggs', quantity: 1, status: 'pending' },
      ],
    });

    expect(summary).toBe('Got 1/3 items (2/4 units) • 1 left • 1 unavailable');
  });

  test('computes progress percentage from processed items', () => {
    const percentage = getProgressPercentage({
      items: [
        { name: 'Milk', status: 'added' },
        { name: 'Bread', status: 'failed' },
        { name: 'Eggs', status: 'pending' },
        { name: 'Butter', status: 'pending' },
      ],
    });

    expect(percentage).toBe(50);
  });
});
