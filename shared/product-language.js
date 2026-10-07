(function attachProductLanguage(root, factory) {
  const api = factory();

  root.HeySaladProductLanguage = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildProductLanguageApi() {
  const REPLACEMENTS = [
    {
      replacement: 'toilet tissue',
      patterns: [
        /\btoilet\s+paper\b/g,
        /\btoilet\s+rolls?\b/g,
        /\bloo\s+rolls?\b/g,
        /\bbath(?:room)?\s+tissues?\b/g,
      ],
    },
    {
      replacement: 'kitchen roll',
      patterns: [
        /\bpaper\s+towels?\b/g,
        /\bkitchen\s+towels?\b/g,
      ],
    },
    {
      replacement: 'coriander',
      patterns: [/\bcilantro\b/g],
    },
    {
      replacement: 'courgette',
      patterns: [/\bzucchini\b/g],
    },
    {
      replacement: 'aubergine',
      patterns: [/\beggplant\b/g],
    },
    {
      replacement: 'spring onion',
      patterns: [/\bscallions?\b/g, /\bgreen\s+onions?\b/g],
    },
  ];
  const OBVIOUS_MISMATCH_RULES = [
    { item: 'apple', wrong: ['juice', 'cider', 'sauce'] },
    { item: 'tomato', wrong: ['sauce', 'paste', 'puree', 'soup', 'ketchup'] },
    { item: 'chicken', wrong: ['stock', 'soup', 'gravy', 'nugget'] },
    { item: 'orange', wrong: ['juice', 'marmalade'] },
    { item: 'toilet tissue', wrong: ['facial tissue', 'kitchen roll'] },
    { item: 'kitchen roll', wrong: ['toilet tissue', 'facial tissue'] },
    { item: 'eggs', wrong: ['mini egg', 'creme egg', 'easter egg', 'custard', 'tart', 'chocolate'] },
  ];
  const BRAND_PREFIX_PATTERNS = [
    /^M&S\s+/i,
    /^Ocado\s+/i,
    /^Tilda\s+/i,
    /^Heinz\s+/i,
    /^Starbucks\s+/i,
    /^Nescafe\s+/i,
    /^Ribena\s+/i,
    /^Muller\s+/i,
    /^Andrex\s+/i,
    /^Twister\s+/i,
    /^Propercorn\s+/i,
    /^Plenty\s+/i,
    /^Mlekovita\s+/i,
    /^The\s+Jolly\s+Hog\s+/i,
    /^Elbow\s+Grease\s+/i,
  ];
  const SEARCH_DESCRIPTOR_PATTERNS = [
    /\beasy\s+cook\b/gi,
    /\bclassic\b/gi,
    /\bcollection\b/gi,
    /\breduced\s+fat\b/gi,
    /\bfree\s+range\b/gi,
    /\bbritish\b/gi,
  ];

  function cleanText(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanSearchText(text) {
    return String(text || '')
      .replace(/\bM\s*(?:&|and)\s*S\b/gi, 'M&S')
      .replace(/[,;:]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeSemanticText(text) {
    let normalized = cleanText(text);

    for (const rule of REPLACEMENTS) {
      for (const pattern of rule.patterns) {
        normalized = normalized.replace(pattern, rule.replacement);
      }
    }

    return normalized.replace(/\s+/g, ' ').trim();
  }

  function getPreferredSearchQuery(text) {
    const searchText = cleanSearchText(text);
    const normalized = normalizeSemanticText(searchText);

    if (!normalized) {
      return '';
    }

    if (/\bM&S\b/.test(searchText)) {
      return searchText;
    }

    return normalized;
  }

  function unique(values) {
    const seen = new Set();
    return values
      .map((value) => cleanSearchText(value))
      .filter(Boolean)
      .filter((value) => {
        const key = normalizeSemanticText(value);
        if (!key || seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
  }

  function stripBrandPrefix(text) {
    let result = cleanSearchText(text);

    for (const pattern of BRAND_PREFIX_PATTERNS) {
      result = result.replace(pattern, '');
    }

    return result.trim();
  }

  function stripMeasureHints(text) {
    return cleanSearchText(text)
      .replace(/\b\d+\s*x\s*\d+(?:\.\d+)?\s*(?:kg|g|ml|l|cl|oz|lb)\b/gi, '')
      .replace(/\b\d+(?:\.\d+)?\s*(?:kg|g|ml|l|cl|oz|lb)\b/gi, '')
      .replace(/\b\d+\s*(?:pack|packs|pk|pks|roll|rolls|bag|bags|bottle|bottles|box|boxes|can|cans|tin|tins|jar|jars|loaf|loaves|carton|cartons|tub|tubs)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function stripSearchDescriptors(text) {
    let result = cleanSearchText(text);

    for (const pattern of SEARCH_DESCRIPTOR_PATTERNS) {
      result = result.replace(pattern, '');
    }

    return result.replace(/\s+/g, ' ').trim();
  }

  function getSearchQueryVariants(text) {
    const preferred = getPreferredSearchQuery(text);
    const withoutBrand = stripBrandPrefix(preferred || text);
    const genericWithSize = stripSearchDescriptors(withoutBrand);
    const genericWithoutSize = stripMeasureHints(genericWithSize);
    const withoutSize = stripMeasureHints(preferred || text);
    const withoutBrandOrSize = stripMeasureHints(withoutBrand);

    const variants = [];

    if (genericWithoutSize) {
      variants.push(genericWithoutSize);
    }

    if (genericWithSize) {
      variants.push(genericWithSize);
    }

    variants.push(preferred);

    if (withoutBrand) {
      variants.push(withoutBrand);
    }

    if (withoutSize) {
      variants.push(withoutSize);
    }

    if (withoutBrandOrSize) {
      variants.push(withoutBrandOrSize);
    }

    return unique(variants);
  }

  function getObviousMismatchReason(query, productName) {
    const normalizedQuery = normalizeSemanticText(query);
    const normalizedProduct = normalizeSemanticText(productName);

    for (const rule of OBVIOUS_MISMATCH_RULES) {
      if (!normalizedQuery.includes(rule.item)) {
        continue;
      }

      const mismatch = rule.wrong.find((term) => {
        return normalizedProduct.includes(term) && !normalizedQuery.includes(term);
      });

      if (mismatch) {
        return `Rejected ${productName} because it looks like ${mismatch}, not ${query}.`;
      }
    }

    return null;
  }

  return {
    normalizeSemanticText,
    getPreferredSearchQuery,
    getSearchQueryVariants,
    getObviousMismatchReason,
  };
});
