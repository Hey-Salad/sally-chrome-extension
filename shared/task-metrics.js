(function attachTaskMetrics(root, factory) {
  const api = factory();

  root.HeySaladTaskMetrics = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildTaskMetricsApi() {
  function normalizeQuantity(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
  }

  function getItems(task) {
    return Array.isArray(task?.items) ? task.items : [];
  }

  function sumUnits(items, predicate) {
    return items.reduce((total, item) => {
      return predicate(item) ? total + normalizeQuantity(item.quantity) : total;
    }, 0);
  }

  function computeTaskMetrics(task) {
    const items = getItems(task);
    const totalItems = items.length;
    const addedItems = items.filter((item) => item.status === 'added').length;
    const failedItems = items.filter((item) => item.status === 'failed').length;
    const searchingItems = items.filter((item) => item.status === 'searching').length;
    const processedItems = addedItems + failedItems;
    const remainingItems = Math.max(totalItems - processedItems, 0);
    const totalUnits = sumUnits(items, () => true);
    const addedUnits = sumUnits(items, (item) => item.status === 'added');
    const failedUnits = sumUnits(items, (item) => item.status === 'failed');
    const processedUnits = addedUnits + failedUnits;
    const remainingUnits = Math.max(totalUnits - processedUnits, 0);

    return {
      totalItems,
      addedItems,
      failedItems,
      searchingItems,
      processedItems,
      remainingItems,
      totalUnits,
      addedUnits,
      failedUnits,
      processedUnits,
      remainingUnits,
      hasMultiQuantity: totalUnits > totalItems,
    };
  }

  function getProgressPercentage(taskOrMetrics) {
    const metrics = taskOrMetrics?.items ? computeTaskMetrics(taskOrMetrics) : taskOrMetrics;

    if (!metrics?.totalItems) {
      return 0;
    }

    return Math.round((metrics.processedItems / metrics.totalItems) * 100);
  }

  function formatProgressSummary(taskOrMetrics) {
    const metrics = taskOrMetrics?.items ? computeTaskMetrics(taskOrMetrics) : taskOrMetrics;

    if (!metrics?.totalItems) {
      return 'Got 0/0 items • 0 left';
    }

    const itemSummary = `Got ${metrics.addedItems}/${metrics.totalItems} items`;
    const unitSummary = metrics.hasMultiQuantity
      ? ` (${metrics.addedUnits}/${metrics.totalUnits} units)`
      : '';
    const parts = [
      `${itemSummary}${unitSummary}`,
      `${metrics.remainingItems} left`,
    ];

    if (metrics.failedItems > 0) {
      parts.push(`${metrics.failedItems} unavailable`);
    }

    return parts.join(' • ');
  }

  return {
    normalizeQuantity,
    computeTaskMetrics,
    getProgressPercentage,
    formatProgressSummary,
  };
});
