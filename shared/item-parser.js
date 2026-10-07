(function attachItemParser(root, factory) {
  const api = factory();

  root.HeySaladItemParser = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildItemParserApi() {
  const SIZE_UNITS = new Set(['g', 'kg', 'ml', 'l', 'cl', 'oz', 'lb']);
  const PACKAGE_UNITS = new Set([
    'bag',
    'bags',
    'bottle',
    'bottles',
    'box',
    'boxes',
    'can',
    'cans',
    'carton',
    'cartons',
    'jar',
    'jars',
    'loaf',
    'loaves',
    'pack',
    'packs',
    'pk',
    'pks',
    'roll',
    'rolls',
    'tin',
    'tins',
    'tub',
    'tubs',
  ]);

  function cleanText(value) {
    return String(value || '')
      .replace(/^[\s\-*•]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeQuantity(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return 1;
    }

    return Math.max(1, Math.round(numeric));
  }

  function formatAmount(value, unit) {
    if (unit === 'l') {
      return `${value}L`;
    }

    return `${value}${unit}`;
  }

  function normalizeMeasurePrefix(text) {
    const prefixMatch = text.match(/^(\d+(?:\.\d+)?)\s*(kg|g|ml|l|cl|oz|lb)\s+(.+)$/i);
    if (prefixMatch) {
      const value = prefixMatch[1];
      const unit = prefixMatch[2].toLowerCase();
      const itemName = cleanText(prefixMatch[3]);
      const amount = formatAmount(value, unit);
      return {
        name: cleanText(`${itemName} ${amount}`),
        requestedSize: { value: Number(value), unit, label: amount, kind: 'measure' },
      };
    }

    const suffixMatch = text.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(kg|g|ml|l|cl|oz|lb)$/i);
    if (suffixMatch) {
      const itemName = cleanText(suffixMatch[1]);
      const value = suffixMatch[2];
      const unit = suffixMatch[3].toLowerCase();
      const amount = formatAmount(value, unit);
      return {
        name: cleanText(`${itemName} ${amount}`),
        requestedSize: { value: Number(value), unit, label: amount, kind: 'measure' },
      };
    }

    return {
      name: text,
      requestedSize: null,
    };
  }

  function normalizePackagePrefix(text) {
    const prefixMatch = text.match(/^(\d+)\s*(pack|packs|pk|pks|roll|rolls|bag|bags|bottle|bottles|box|boxes|can|cans|tin|tins|jar|jars|loaf|loaves|carton|cartons|tub|tubs)\s+(.+)$/i);
    if (prefixMatch) {
      const value = prefixMatch[1];
      const unit = prefixMatch[2].toLowerCase();
      const itemName = cleanText(prefixMatch[3]);
      const label = `${value} ${unit}`;
      return {
        name: cleanText(`${itemName} ${label}`),
        requestedSize: { value: Number(value), unit, label, kind: 'package' },
      };
    }

    const suffixMatch = text.match(/^(.+?)\s+(\d+)\s*(pack|packs|pk|pks|roll|rolls|bag|bags|bottle|bottles|box|boxes|can|cans|tin|tins|jar|jars|loaf|loaves|carton|cartons|tub|tubs)$/i);
    if (suffixMatch) {
      const itemName = cleanText(suffixMatch[1]);
      const value = suffixMatch[2];
      const unit = suffixMatch[3].toLowerCase();
      const label = `${value} ${unit}`;
      return {
        name: cleanText(`${itemName} ${label}`),
        requestedSize: { value: Number(value), unit, label, kind: 'package' },
      };
    }

    return {
      name: text,
      requestedSize: null,
    };
  }

  function parseShoppingLine(line) {
    const cleaned = cleanText(line);
    if (!cleaned) {
      return null;
    }

    let quantity = 1;
    let remainder = cleaned;

    const prefixMatch = cleaned.match(/^(\d+)\s*[x×]\s+(.+)$/i);
    if (prefixMatch) {
      quantity = normalizeQuantity(prefixMatch[1]);
      remainder = cleanText(prefixMatch[2]);
    } else {
      const suffixMatch = cleaned.match(/^(.+?)\s*[x×]\s*(\d+)$/i);
      if (suffixMatch) {
        remainder = cleanText(suffixMatch[1]);
        quantity = normalizeQuantity(suffixMatch[2]);
      } else {
        const parenMatch = cleaned.match(/^(.+?)\s*\((\d+)\)$/);
        if (parenMatch) {
          remainder = cleanText(parenMatch[1]);
          quantity = normalizeQuantity(parenMatch[2]);
        }
      }
    }

    const measuredResult = normalizeMeasurePrefix(remainder);
    const packageResult = normalizePackagePrefix(remainder);

    let normalized;
    if (measuredResult.requestedSize && packageResult.requestedSize) {
      // Both dimensions matched: measure wins for scoring, but combine labels in name
      const packageLabel = packageResult.requestedSize.label;
      const combinedName = measuredResult.name.includes(packageLabel)
        ? measuredResult.name
        : cleanText(measuredResult.name + ' ' + packageLabel);
      normalized = { name: combinedName, requestedSize: measuredResult.requestedSize };
    } else if (measuredResult.requestedSize) {
      normalized = measuredResult;
    } else {
      normalized = packageResult;
    }

    return {
      rawText: cleaned,
      name: normalized.name,
      quantity,
      searchQuery: normalized.name,
      requestedSize: normalized.requestedSize,
    };
  }

  function parseItems(text) {
    return String(text || '')
      .split('\n')
      .map((line) => parseShoppingLine(line))
      .filter((item) => item && item.name);
  }

  function getItemSearchQuery(item) {
    if (typeof item === 'string') {
      const parsed = parseShoppingLine(item);
      return parsed?.searchQuery || cleanText(item);
    }

    const candidate = cleanText(item?.searchQuery || item?.name || item?.rawText);
    if (candidate) {
      return candidate;
    }

    return '';
  }

  function normalizeShoppingItem(input) {
    if (typeof input === 'string') {
      return parseShoppingLine(input);
    }

    const sourceText = cleanText(input?.rawText || input?.searchQuery || input?.name);
    const parsed = parseShoppingLine(sourceText || '');
    const name = cleanText(input?.name || parsed?.name);
    if (!name) {
      return null;
    }

    return {
      ...input,
      rawText: sourceText || parsed?.rawText || name,
      name,
      quantity: normalizeQuantity(input?.quantity || parsed?.quantity),
      searchQuery: cleanText(input?.searchQuery || parsed?.searchQuery || name),
      requestedSize: input?.requestedSize || parsed?.requestedSize || null,
    };
  }

  return {
    parseShoppingLine,
    parseItems,
    getItemSearchQuery,
    normalizeShoppingItem,
    SIZE_UNITS,
    PACKAGE_UNITS,
  };
});
