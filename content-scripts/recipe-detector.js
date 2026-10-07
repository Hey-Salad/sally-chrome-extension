/**
 * Sally by HeySalad® - Recipe Detector
 *
 * Detects recipe ingredients on recipe pages and social/video pages, then asks
 * the background worker to save the list and offer a shopping action.
 */

(function() {
  'use strict';

  if (window.__heysaladRecipeDetectorInitialized) return;
  window.__heysaladRecipeDetectorInitialized = true;

  const SOCIAL_HOSTS = [
    'youtube.com',
    'youtu.be',
    'instagram.com',
    'tiktok.com',
  ];
  const SUPERMARKET_HOSTS = [
    'tesco.com',
    'sainsburys.co.uk',
    'asda.com',
    'ocado.com',
    'waitrose.com',
    'morrisons.com',
    'aldi.co.uk',
  ];
  const MAX_INGREDIENTS = 60;
  const MIN_INGREDIENTS = 3;
  let scanTimer = null;

  function getHost() {
    return window.location.hostname.replace(/^www\./, '').toLowerCase();
  }

  function isBlockedHost() {
    const host = getHost();
    return SUPERMARKET_HOSTS.some((blockedHost) => host.includes(blockedHost));
  }

  function isSocialHost() {
    const host = getHost();
    return SOCIAL_HOSTS.some((socialHost) => host.includes(socialHost));
  }

  function normalizeLine(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/^[•*\-–—✓]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .trim();
  }

  function looksLikeIngredient(line) {
    const text = normalizeLine(line);
    if (text.length < 3 || text.length > 110) return false;
    if (/^(method|directions|instructions|steps?|prep|cook|serves|yield|nutrition)$/i.test(text)) return false;
    return /(\d|cup|cups|tbsp|tsp|teaspoon|tablespoon|g\b|kg\b|ml\b|l\b|oz\b|lb\b|pinch|handful|clove|slice|can|tin|pack|packet|bunch|sprig|salt|pepper|oil|butter|flour|sugar|milk|egg|cheese|onion|garlic|tomato|potato|carrot|chicken|beef|lamb|pork|fish|rice|pasta)/i.test(text);
  }

  function uniqueIngredients(lines) {
    const seen = new Set();
    return lines
      .map(normalizeLine)
      .filter(looksLikeIngredient)
      .filter((line) => {
        const key = line.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_INGREDIENTS);
  }

  function flattenJsonLd(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
    if (typeof value !== 'object') return [];

    const nodes = [value];
    if (Array.isArray(value['@graph'])) {
      nodes.push(...value['@graph'].flatMap(flattenJsonLd));
    }
    if (Array.isArray(value.itemListElement)) {
      nodes.push(...value.itemListElement.flatMap(flattenJsonLd));
    }
    return nodes;
  }

  function isRecipeNode(node) {
    const type = node?.['@type'];
    return Array.isArray(type)
      ? type.some((entry) => String(entry).toLowerCase() === 'recipe')
      : String(type || '').toLowerCase() === 'recipe';
  }

  function getRecipeName(node) {
    return String(node?.name || document.title || 'Recipe').trim();
  }

  function getJsonLdRecipes() {
    return Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .flatMap((script) => {
        try {
          return flattenJsonLd(JSON.parse(script.textContent || '{}'));
        } catch {
          return [];
        }
      })
      .filter(isRecipeNode)
      .map((node) => ({
        title: getRecipeName(node),
        ingredients: uniqueIngredients([].concat(node.recipeIngredient || [])),
        source: 'json-ld',
      }))
      .filter((recipe) => recipe.ingredients.length >= MIN_INGREDIENTS);
  }

  function getMicrodataRecipes() {
    const roots = Array.from(document.querySelectorAll('[itemtype*="Recipe" i], [typeof*="Recipe" i]'));
    return roots.map((root) => {
      const ingredients = Array.from(root.querySelectorAll('[itemprop="recipeIngredient"], [property="recipeIngredient"]'))
        .map((el) => el.getAttribute('content') || el.textContent || '');
      const title = root.querySelector('[itemprop="name"], [property="name"]')?.textContent || document.title || 'Recipe';
      return {
        title: normalizeLine(title),
        ingredients: uniqueIngredients(ingredients),
        source: 'microdata',
      };
    }).filter((recipe) => recipe.ingredients.length >= MIN_INGREDIENTS);
  }

  function getIngredientsFromTextBlocks() {
    const blocks = [];
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,strong,b'))
      .filter((el) => /\bingredients?\b/i.test(el.textContent || ''));

    for (const heading of headings.slice(0, 4)) {
      let node = heading.nextElementSibling;
      for (let depth = 0; node && depth < 5; depth += 1, node = node.nextElementSibling) {
        const lines = Array.from(node.querySelectorAll?.('li') || []).map((li) => li.textContent || '');
        if (lines.length) blocks.push(...lines);
        if (/method|directions|instructions/i.test(node.textContent || '')) break;
      }
    }

    if (!blocks.length && isSocialHost()) {
      const description = [
        document.querySelector('meta[name="description"]')?.content,
        document.querySelector('meta[property="og:description"]')?.content,
        document.body?.innerText,
      ].filter(Boolean).join('\n');
      const ingredientsSection = description.match(/ingredients?[:\s]+([\s\S]{1,1600}?)(?:\n\s*(?:method|directions|instructions|steps?)\b|$)/i)?.[1] || '';
      blocks.push(...ingredientsSection.split(/\n|,/));
    }

    return [{
      title: document.querySelector('h1')?.textContent?.trim() || document.title || 'Recipe',
      ingredients: uniqueIngredients(blocks),
      source: isSocialHost() ? 'social-caption' : 'page-text',
    }].filter((recipe) => recipe.ingredients.length >= MIN_INGREDIENTS);
  }

  function getBestRecipe() {
    const candidates = [
      ...getJsonLdRecipes(),
      ...getMicrodataRecipes(),
      ...getIngredientsFromTextBlocks(),
    ];
    return candidates.sort((a, b) => b.ingredients.length - a.ingredients.length)[0] || null;
  }

  function getRecipeCandidate() {
    if (!isSocialHost()) return null;
    const title = document.querySelector('meta[property="og:title"]')?.content ||
      document.querySelector('meta[name="twitter:title"]')?.content ||
      document.title ||
      '';
    const description = document.querySelector('meta[property="og:description"]')?.content ||
      document.querySelector('meta[name="description"]')?.content ||
      document.querySelector('meta[name="twitter:description"]')?.content ||
      '';
    const combined = `${title}\n${description}`;

    if (!/\b(recipe|cook|cooking|meal|dinner|lunch|breakfast|ingredients?|chicken|rice|pasta|pie|soup|curry|noodles)\b/i.test(combined)) {
      return null;
    }

    return {
      title: normalizeLine(title.replace(/\s*\|\s*TikTok$/i, '')) || 'Recipe video',
      description: description.trim(),
      source: 'social-title',
    };
  }

  function getSignature(recipe) {
    return [
      window.location.href.split('#')[0],
      recipe.title,
      recipe.ingredients.slice(0, 8).join('|'),
    ].join('::').toLowerCase();
  }

  function scanForRecipe() {
    if (isBlockedHost()) return;
    const recipe = getBestRecipe();
    if (!recipe) {
      const candidate = getRecipeCandidate();
      if (!candidate) return;

      const candidateSignature = [
        window.location.href.split('#')[0],
        candidate.title,
        candidate.description.slice(0, 120),
      ].join('::').toLowerCase();
      if (sessionStorage.getItem('heysaladRecipeSignature') === candidateSignature) return;
      sessionStorage.setItem('heysaladRecipeSignature', candidateSignature);

      chrome.runtime.sendMessage({
        type: 'RECIPE_CANDIDATE_DETECTED',
        data: {
          title: candidate.title,
          description: candidate.description,
          source: candidate.source,
          url: window.location.href,
          host: getHost(),
        },
      }).catch(() => {});
      return;
    }

    const signature = getSignature(recipe);
    if (sessionStorage.getItem('heysaladRecipeSignature') === signature) return;
    sessionStorage.setItem('heysaladRecipeSignature', signature);

    chrome.runtime.sendMessage({
      type: 'RECIPE_DETECTED',
      data: {
        title: recipe.title,
        source: recipe.source,
        url: window.location.href,
        host: getHost(),
        ingredients: recipe.ingredients,
      },
    }).catch(() => {});
  }

  function scheduleScan(delay = 700) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanForRecipe, delay);
  }

  scheduleScan(1200);
  window.addEventListener('popstate', () => scheduleScan(1500));
  new MutationObserver(() => scheduleScan(1200)).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
