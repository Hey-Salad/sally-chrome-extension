(function attachProductFit(root, factory) {
  const api = factory();

  root.HeySaladProductFit = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildProductFitApi() {
  const HOUSEHOLD_PAPER_TERMS = ['toilet tissue', 'toilet paper', 'toilet roll', 'kitchen roll', 'paper towels', 'loo roll', 'loo paper', 'kitchen paper', 'tissue', 'facial tissue', 'bathroom tissue'];

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function toBaseMeasure(value, unit) {
    const numeric = Number(value);
    const normalizedUnit = String(unit || '').toLowerCase();
    if (!Number.isFinite(numeric)) {
      return null;
    }

    if (normalizedUnit === 'kg') return { type: 'weight', baseValue: numeric * 1000, unit: 'g' };
    if (normalizedUnit === 'g') return { type: 'weight', baseValue: numeric, unit: 'g' };
    if (normalizedUnit === 'lb') return { type: 'weight', baseValue: numeric * 453.592, unit: 'g' };
    if (normalizedUnit === 'oz') return { type: 'weight', baseValue: numeric * 28.3495, unit: 'g' };
    if (normalizedUnit === 'l') return { type: 'volume', baseValue: numeric * 1000, unit: 'ml' };
    if (normalizedUnit === 'ml') return { type: 'volume', baseValue: numeric, unit: 'ml' };
    if (normalizedUnit === 'cl') return { type: 'volume', baseValue: numeric * 10, unit: 'ml' };

    return null;
  }

  function extractPackageCount(name) {
    const directMatch = String(name || '').match(/(\d+)\s*(pack|packs|pk|pks|roll|rolls|bag|bags|bottle|bottles|box|boxes|can|cans|tin|tins|jar|jars|loaf|loaves|carton|cartons|tub|tubs)\b/i);
    if (directMatch) {
      return {
        count: Number(directMatch[1]),
        unit: directMatch[2].toLowerCase(),
      };
    }

    const descriptiveMatch = String(name || '').match(/(\d+)\s+\w+\s+(roll|rolls|bag|bags|bottle|bottles|box|boxes|can|cans|tin|tins|jar|jars|loaf|loaves|carton|cartons|tub|tubs)\b/i);
    if (descriptiveMatch) {
      return {
        count: Number(descriptiveMatch[1]),
        unit: descriptiveMatch[2].toLowerCase(),
      };
    }

    return null;
  }

  function extractProductAttributes(name, price = 0) {
    const cleanedName = String(name || '').trim();
    const normalizedName = normalizeText(cleanedName);
    const measureMatch = cleanedName.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|cl|oz|lb)\b/i);
    const packageMatch = extractPackageCount(cleanedName);
    const measure = measureMatch ? toBaseMeasure(measureMatch[1], measureMatch[2]) : null;

    return {
      name: cleanedName,
      normalizedName,
      price: Number(price) || 0,
      measureValue: measure ? measure.baseValue : null,
      measureType: measure ? measure.type : null,
      measureUnit: measure ? measure.unit : null,
      packageCount: packageMatch ? packageMatch.count : null,
      packageUnit: packageMatch ? packageMatch.unit : null,
    };
  }

  function getRequestedProfile(requestedItem) {
    if (typeof requestedItem === 'string') {
      return {
        query: requestedItem,
        quantity: 1,
        requestedSize: null,
      };
    }

    return {
      query: requestedItem?.searchQuery || requestedItem?.name || '',
      quantity: Number(requestedItem?.quantity) || 1,
      requestedSize: requestedItem?.requestedSize || null,
    };
  }

  function getSizeFitScore(requestedSize, attributes) {
    if (!requestedSize) {
      return 0;
    }

    if (requestedSize.kind === 'measure') {
      const requestedMeasure = toBaseMeasure(requestedSize.value, requestedSize.unit);
      if (!requestedMeasure || !attributes.measureValue || attributes.measureType !== requestedMeasure.type) {
        return -0.15;
      }

      const ratio = attributes.measureValue / requestedMeasure.baseValue;
      if (ratio >= 0.9 && ratio <= 1.1) return 0.35;
      if (ratio >= 0.75 && ratio <= 1.25) return 0.2;
      if (ratio >= 0.5 && ratio <= 1.5) return 0.05;
      if (ratio > 2 || ratio < 0.5) return -0.3;
      return -0.1;
    }

    if (requestedSize.kind === 'package') {
      if (!attributes.packageCount) {
        return -0.1;
      }

      const difference = Math.abs(attributes.packageCount - Number(requestedSize.value));
      if (difference === 0) return 0.25;
      if (difference <= 2) return 0.12;
      if (attributes.packageCount > Number(requestedSize.value) * 2) return -0.2;
      return -0.08;
    }

    return 0;
  }

  function getBulkPenalty(query, quantity, attributes, allProducts) {
    const normalizedQuery = normalizeText(query);
    const isHouseholdPaper = HOUSEHOLD_PAPER_TERMS.some((term) => normalizedQuery.includes(term));
    if (!isHouseholdPaper) {
      return 0;
    }

    let penalty = 0;

    if (attributes.packageCount && attributes.packageCount >= 24) {
      penalty -= 0.3;
    } else if (attributes.packageCount && quantity <= 2 && attributes.packageCount >= 16) {
      penalty -= 0.12;
    }

    const pricedProducts = allProducts
      .map((product) => Number(product?.price) || 0)
      .filter((price) => price > 0)
      .sort((a, b) => a - b);

    const cheapestPrice = pricedProducts[0] || 0;
    if (cheapestPrice > 0 && attributes.price > cheapestPrice * 2.5) {
      penalty -= 0.22;
    }

    if (attributes.price >= 10) {
      penalty -= 0.08;
    }

    return penalty;
  }

  function scoreProductFit(requestedItem, product, allProducts = []) {
    const requested = getRequestedProfile(requestedItem);
    const attributes = product?.normalizedName ? product : extractProductAttributes(product?.name, product?.price);
    const normalizedQuery = normalizeText(requested.query);
    const queryWords = normalizedQuery.split(/\s+/).filter((word) => word.length > 1);

    let score = 0;

    if (normalizedQuery && attributes.normalizedName.includes(normalizedQuery)) {
      score += 0.75;
    } else if (queryWords.length > 0) {
      const matchedWords = queryWords.filter((word) => attributes.normalizedName.includes(word));
      score += (matchedWords.length / queryWords.length) * 0.65;
    }

    score += getSizeFitScore(requested.requestedSize, attributes);

    if (!requested.requestedSize) {
      score += getBulkPenalty(requested.query, requested.quantity, attributes, allProducts);
    }

    if (score < 0) {
      return 0;
    }

    return Math.min(score, 1);
  }

  function chooseBestProductByFit(requestedItem, products, excludedIndices = []) {
    let bestIndex = -1;
    let bestScore = -1;

    products.forEach((product, index) => {
      if (excludedIndices.includes(index)) {
        return;
      }

      const score = scoreProductFit(requestedItem, product, products);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    return {
      success: bestIndex >= 0 && bestScore >= 0.3,
      bestIndex,
      confidence: bestScore >= 0 ? bestScore : 0,
    };
  }

  return {
    extractProductAttributes,
    scoreProductFit,
    chooseBestProductByFit,
  };
});
