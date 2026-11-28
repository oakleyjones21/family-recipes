/* Our Family Table — static recipe site fed by recipes.json (synced from Notion). */
(function () {
  'use strict';

  const main = document.getElementById('main');
  const state = { recipes: [], terms: [], meal: null, kid: false, quick: false };
  let cook = null; // cooking-mode state


  // ---------- helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Text from the sync keeps links as [text](url). Only recipe links (#/recipe/…) and http(s) links are rendered.
  const LINK = /\[([^\]]+)\]\((#\/recipe\/[a-z0-9-]+|https?:\/\/[^)\s]+)\)/g;
  const unlink = (s) => String(s ?? '').replace(LINK, '$1');
  const rich = (s) => esc(s).replace(LINK, (_, label, url) => url.startsWith('#/')
    ? `<a class="inline-link" href="${url}">${label}</a>`
    : `<a class="inline-link" href="${url}" rel="noopener" target="_blank">${label}</a>`);
  const norm = (s) => String(s || '').toLowerCase().trim();
  const singular = (w) => (w.length > 3 && w.endsWith('es') && !w.endsWith('ses') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
  const totalMin = (r) => (r.prep || 0) + (r.cook || 0);
  const timeLabel = (r) => {
    const t = totalMin(r);
    if (!t) return r.totalTime || '';
    if (t < 60) return t + ' min';
    const h = Math.floor(t / 60), m = t % 60;
    return h + ' hr' + (m ? ' ' + m + ' min' : '');
  };
  const stars = (n) => (n ? '★'.repeat(n) : '');
  const isQuick = (r) => r.totalTime === 'Under 30 min' || (totalMin(r) > 0 && totalMin(r) <= 30);
  const visible = () => state.recipes.filter((r) => r.status !== 'Retired');

  // Line icons (24px grid). Each value is one SVG path; see icons/svg/ for the files.
  const ICON_PATHS = {
      "appetizer": "M2 15.5H22M3.5 15.5C4 18.3 7.5 20 12 20C16.5 20 20 18.3 20.5 15.5M4.1 12.8a2.7 2.7 0 1 0 5.4 0a2.7 2.7 0 1 0 -5.4 0M9.3 12.8a2.7 2.7 0 1 0 5.4 0a2.7 2.7 0 1 0 -5.4 0M14.5 12.8a2.7 2.7 0 1 0 5.4 0a2.7 2.7 0 1 0 -5.4 0M6.8 10.1V5.5M12 10.1V5.5M17.2 10.1V5.5",
      "sauce": "M2.5 10H15C17.5 10 19.5 8.8 21.5 6.5C21.5 12.5 18 17 12.5 17H9C5.4 17 2.5 14 2.5 10ZM8.5 17L8 20H15L14.5 17M2.5 10C0.8 10.5 1 13.8 3.4 13.8M21.5 6.5V9M5.5 12.5H15.5",
      "breakfast": "M7 6C10 3 15 4 17 7C20 8 21 12 19 15C18 19 13 21 9 19C5 18 3 14 4 10C4.5 8 5.5 7 7 6ZM9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
      "dinner": "M8.0 12a6.5 6.5 0 1 0 13.0 0a6.5 6.5 0 1 0 -13.0 0M11.0 12a3.5 3.5 0 1 0 7.0 0a3.5 3.5 0 1 0 -7.0 0M3.5 4V8.5C3.5 9.5 4.2 10 5 10C5.8 10 6.5 9.5 6.5 8.5V4M5 4V20",
      "dessert": "M4 19H20V12L4 9ZM4 13L20 15.5M13.5 8.6a1.5 1.5 0 1 0 3.0 0a1.5 1.5 0 1 0 -3.0 0M15 7.1C15 6 15.8 5 17 4.5",
      "soup": "M3 11H21C21 16 17 20 12 20C7 20 3 16 3 11ZM10 8C9 6.5 11 5.5 10 4M14 8C13 6.5 15 5.5 14 4",
      "bread": "M5 20V11C3.5 10 3 8.5 3.5 7C4.5 4.5 8 4 12 4C16 4 19.5 4.5 20.5 7C21 8.5 20.5 10 19 11V20ZM8.5 10L10.5 8M11.5 10L13.5 8M14.5 10L16.5 8",
      "salad": "M3 12H21C21 17 17 20 12 20C7 20 3 17 3 12ZM12 12C10 8 11 5 15 3C17 6 16 10 12 12ZM12 12L14.5 6M8 12C6 10 6 8 7 6.5C9.5 7.5 10 10 8 12Z",
      "pasta": "M12 21V12M9.5 3V8.5C9.5 10.5 10.5 12 12 12C13.5 12 14.5 10.5 14.5 8.5V3M12 3V8.5M6.5 8C6.5 6.5 17.5 6.5 17.5 8C17.5 9.8 6.5 9.8 6.5 8Z",
      "asian": "M3 12H21C21 17 17 20 12 20C7 20 3 17 3 12ZM14 10L21 4M11 10L19.5 3",
      "comfort": "M4 10H20V16C20 18 18.5 19 17 19H7C5.5 19 4 18 4 16ZM4 12H2M20 12H22M5 10C6 6.5 18 6.5 19 10M12 7.4V5.5M10.5 5.5H13.5",
      "grill": "M4 10H20C20 14.5 16.5 17 12 17C7.5 17 4 14.5 4 10ZM8 16L6 21M16 16L18 21M12 17V21M10 7C9 5.5 11 5 10 3.5M14 7C13 5.5 15 5 14 3.5",
      "sides": "M15.5 8.5C13 7 10 8 8.5 11L3.5 20.5L13 15.5C16 14 17 11 15.5 8.5ZM16 8L20 4M16.5 9.5L21 8.5M15 7.5L15.5 3M8 13.5L10 14.5M6 17L8 18",
      "drinks": "M5 8H16V16C16 18.5 14.5 20 12 20H9C6.5 20 5 18.5 5 16ZM16 10H18C19.5 10 20.5 11 20.5 12.5C20.5 14 19.5 15 18 15H16M9 6C8 4.5 10 4 9 2.5M12.5 6C11.5 4.5 13.5 4 12.5 2.5",
      "sandwich": "M4 9C4 6 7.5 4 12 4C16.5 4 20 6 20 9ZM3 12.5C5 11 6.5 14 8.5 12.5C10.5 11 12 14 14 12.5C16 11 17.5 14 21 12.5M4 16H20V18C20 19.1 19.1 20 18 20H6C4.9 20 4 19.1 4 18Z",
      "taco": "M3 17C3 10.5 7 7 12 7C17 7 21 10.5 21 17ZM5 11C6 9.5 7.5 9.5 8.5 10.5C9.5 9 11 9 12 10C13 9 14.5 9 15.5 10.5C16.5 9.5 18 9.5 19 11",
      "pie": "M3 12H21L19.5 17C19.2 18.2 18 19 16.8 19H7.2C6 19 4.8 18.2 4.5 17ZM4 12C5 8 8.5 6 12 6C15.5 6 19 8 20 12M10 9.5L11 8.5M13 9.5L14 8.5",
      "cookie": "M3.5 12a8.5 8.5 0 1 0 17.0 0a8.5 8.5 0 1 0 -17.0 0M8 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M13.6 8.5a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0M14 14a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M8.6 15a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0",
      "celebration": "M4 20H20V13C20 12 19.5 11.5 18.5 11.5H5.5C4.5 11.5 4 12 4 13ZM4 15C6 16.5 8 13.5 10 15C12 16.5 14 13.5 16 15C18 16.5 19 14 20 15M12 11.5V7.5M12 5.8C11.2 5 11.4 4 12 3C12.6 4 12.8 5 12 5.8Z",
      "fish": "M3 12C6 7 12 6 16 9L21 6V18L16 15C12 18 6 17 3 12ZM6.7 11a0.8 0.8 0 1 0 1.6 0a0.8 0.8 0 1 0 -1.6 0M10 9.5C11 11 11 13 10 14.5",
      "prep-time": "M3.5 12a8.5 8.5 0 1 0 17.0 0a8.5 8.5 0 1 0 -17.0 0M12 7.5V12L15 14",
      "cook-time": "M12 21C8 21 5.5 18.5 5.5 15C5.5 11 9 9.5 9.5 5C12.5 6.5 13.5 9 13 11C14.5 10.5 15.5 9 15.5 7.5C17.5 9.5 18.5 12 18.5 15C18.5 18.5 16 21 12 21ZM12 21C10.3 21 9.5 19.8 9.5 18.5C9.5 16.8 11 16 12 14.5C13 16 14.5 16.8 14.5 18.5C14.5 19.8 13.7 21 12 21Z",
      "servings": "M6 8a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M3.5 19C3.5 15.5 6 13.5 9 13.5C12 13.5 14.5 15.5 14.5 19M14.0 9a2.5 2.5 0 1 0 5.0 0a2.5 2.5 0 1 0 -5.0 0M15.5 13.6C18.5 13.4 20.5 15.5 20.5 18.5",
      "favorite": "M12 20C12 20 3.5 15 3.5 9C3.5 6.2 5.6 4.5 8 4.5C9.8 4.5 11.2 5.5 12 7C12.8 5.5 14.2 4.5 16 4.5C18.4 4.5 20.5 6.2 20.5 9C20.5 15 12 20 12 20Z",
      "print": "M7 9V3.5H17V9M7 17H4.5C3.7 17 3 16.3 3 15.5V10.5C3 9.7 3.7 9 4.5 9H19.5C20.3 9 21 9.7 21 10.5V15.5C21 16.3 20.3 17 19.5 17H17M7 14H17V20.5H7Z",
      "steps": "M10 6H20M10 12H20M10 18H20M3.5 6a1.5 1.5 0 1 0 3.0 0a1.5 1.5 0 1 0 -3.0 0M3.5 12a1.5 1.5 0 1 0 3.0 0a1.5 1.5 0 1 0 -3.0 0M3.5 18a1.5 1.5 0 1 0 3.0 0a1.5 1.5 0 1 0 -3.0 0",
      "quick": "M13 3L5 13.5H11.5L10.5 21L19 10H12.5Z",
      "kid-friendly": "M12 3.5L14.6 8.8L20.4 9.6L16.2 13.7L17.2 19.5L12 16.8L6.8 19.5L7.8 13.7L3.6 9.6L9.4 8.8Z",
      "timer": "M4.5 13.5a7.5 7.5 0 1 0 15.0 0a7.5 7.5 0 1 0 -15.0 0M12 13.5V10M10 3H14M12 3V6M18.5 6.5L19.8 5.2",
      "ingredients": "M3 10H21L19 20H5ZM7 10C7 6 9.5 4 12 4C14.5 4 17 6 17 10M9 13V17M12 13V17M15 13V17",
      "notes": "M4 20L5 15.5L15.5 5C16.3 4.2 17.7 4.2 18.5 5L19 5.5C19.8 6.3 19.8 7.7 19 8.5L8.5 19ZM14 6.5L17.5 10",
      "meal-plan": "M4 7C4 5.9 4.9 5 6 5H18C19.1 5 20 5.9 20 7V18C20 19.1 19.1 20 18 20H6C4.9 20 4 19.1 4 18ZM4 10H20M8 3V7M16 3V7M9 15L11 17L15 13",
      "shopping-list": "M3 4H5.5L7.5 15H18L20 7.5H6.2M7.6 19a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0M15.1 19a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0",
      "dice": "M4 7C4 5.3 5.3 4 7 4H17C18.7 4 20 5.3 20 7V17C20 18.7 18.7 20 17 20H7C5.3 20 4 18.7 4 17ZM8.5 8.5h.01M15.5 15.5h.01M12 12h.01M15.5 8.5h.01M8.5 15.5h.01",
      "shuffle": "M3 7H6.5C8.5 7 9.7 8 10.8 9.7L13.2 14.3C14.3 16 15.5 17 17.5 17H21M3 17H6.5C7.9 17 8.9 16.5 9.7 15.6M14.3 8.4C15.1 7.5 16.1 7 17.5 7H21M18 4L21 7L18 10M18 14L21 17L18 20",
      "close": "M6 6L18 18M18 6L6 18",
      "chev-l": "M15 5L8 12L15 19",
      "chev-r": "M9 5L16 12L9 19"
  };
  const icon = (name, cls = 'ico') => ICON_PATHS[name]
    ? `<svg class="${cls}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON_PATHS[name]}"/></svg>`
    : '';
  // Pick a category icon from the recipe's meal type and cuisine.
  // A recipe can have several meal types. Older data only has the single mealType.
  const mealsOf = (r) => (r.mealTypes && r.mealTypes.length ? r.mealTypes : r.mealType ? [r.mealType] : []);
  function categoryIcon(r) {
    const cuisine = norm(r.cuisine);
    const byMeal = { breakfast: 'breakfast', brunch: 'breakfast', dessert: 'dessert', soup: 'soup', salad: 'salad', bread: 'bread', baking: 'bread', drink: 'drinks', drinks: 'drinks', side: 'sides', sides: 'sides', lunch: 'sandwich', snack: 'cookie', snacks: 'cookie', appetizer: 'appetizer', appetizers: 'appetizer', 'sauce & staple': 'sauce', sauce: 'sauce', staple: 'sauce' };
    const byCuisine = { italian: 'pasta', asian: 'asian', chinese: 'asian', japanese: 'asian', thai: 'asian', korean: 'asian', vietnamese: 'asian', mexican: 'taco', 'tex-mex': 'taco', comfort: 'comfort', bbq: 'grill', seafood: 'fish' };
    const meal = mealsOf(r).map(norm).find((m) => byMeal[m]);
    return byMeal[meal] || byCuisine[cuisine] || 'dinner';
  }

  function thumb(r, cls) {
    return r.photo
      ? `<div class="${cls}"><img src="${esc(r.photo)}" alt="${esc(r.name)}" loading="lazy"></div>`
      : `<div class="${cls}">${icon(categoryIcon(r), 'ico-lg')}</div>`;
  }

  // Does recipe r use ingredient term t? Checks tags first, then every ingredient line.
  function uses(r, t) {
    const s = singular(t);
    if ((r.keyIngredients || []).some((k) => { const n = norm(k); return n === t || n === s || n.includes(s); })) return true;
    const re = new RegExp('\\b' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    return (r.ingredientGroups || []).some((g) => g.items.some((line) => re.test(unlink(line))));
  }

  // ---------- routing ----------
  function parseHash() {
    const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    const [path, query] = raw.split('?');
    return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(query || '') };
  }

  function route() {
    closeCook();
    document.querySelectorAll('dialog.chooser').forEach((d) => d.close());
    const t = document.getElementById('toast');
    if (t && parseHash().parts[0] !== 'plan') t.hidden = true;
    const { parts, params } = parseHash();
    const view = parts[0] || 'home';
    document.querySelectorAll('[data-nav]').forEach((a) => {
      const on = a.dataset.nav === (view === 'recipe' ? '' : view);
      on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
      // On phones the menu scrolls sideways; keep the current page in view.
      if (on && a.parentElement.scrollWidth > a.parentElement.clientWidth) a.parentElement.scrollLeft = a.offsetLeft - 8;
    });
    if (view === 'recipe') {
      renderRecipe(parts[1]);
      if (params.get('print') === '1') setTimeout(() => { try { window.print(); } catch (_) {} }, 700);
      return;
    }
    if (view === 'search') return renderSearch(params.get('q') || '');
    if (view === 'plan') return renderPlan(parts, params);
    if (view === 'surprise') return renderSurprise();
    state.terms = (params.get('i') || '').split(',').map(norm).filter(Boolean);
    renderHome(view);
  }

  function setTerms(terms) {
    const { parts } = parseHash();
    const base = parts[0] && parts[0] !== 'recipe' ? parts[0] : '';
    const q = terms.length ? '?i=' + encodeURIComponent(terms.join(',')) : '';
    location.hash = '#/' + base + q;
  }

  // ---------- home / lists ----------
  function renderHome(view) {
    let pool = visible();
    let title = 'All recipes';
    if (view === 'favorites') { pool = pool.filter((r) => r.status === 'Family Favorite'); title = 'Family favorites'; }
    if (view === 'weeknight') { pool = pool.filter((r) => (r.occasion || []).includes('Weeknight')); title = 'Weeknight dinners'; }

    const terms = state.terms;
    let scored = pool.map((r) => ({ r, hits: terms.filter((t) => uses(r, t)).length }));
    if (terms.length) scored = scored.filter((x) => x.hits > 0);
    if (state.meal) scored = scored.filter((x) => mealsOf(x.r).includes(state.meal));
    if (state.kid) scored = scored.filter((x) => (x.r.occasion || []).includes('Kid Can Make'));
    if (state.quick) scored = scored.filter((x) => isQuick(x.r));
    scored.sort((a, b) => b.hits - a.hits || (b.r.rating || 0) - (a.r.rating || 0) || a.r.name.localeCompare(b.r.name));

    const full = terms.length ? scored.filter((x) => x.hits === terms.length).length : scored.length;
    const partial = terms.length ? scored.length - full : 0;
    const plural = (n) => `${n} ${n === 1 ? 'recipe' : 'recipes'}`;
    const matchLine = !terms.length
      ? ''
      : `<b>${plural(full)}</b> ${full === 1 ? 'uses' : 'use'} ${terms.length === 1 ? 'it' : terms.length === 2 ? 'both' : 'all of them'}`
        + (partial ? ` · ${partial} more ${partial === 1 ? 'uses' : 'use'} ${terms.length === 2 ? 'one' : 'some'}` : '');

    const tryCounts = {};
    pool.forEach((r) => [...(r.method || []), r.cuisine].filter(Boolean).forEach((k) => { tryCounts[k] = (tryCounts[k] || 0) + 1; }));
    const tries = Object.entries(tryCounts).sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 3);

    const tagCounts = {};
    pool.forEach((r) => (r.keyIngredients || []).forEach((k) => { tagCounts[k] = (tagCounts[k] || 0) + 1; }));
    const suggestions = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(([k]) => k).filter((k) => !terms.includes(norm(k))).slice(0, 3);
    const meals = [...new Set(pool.flatMap(mealsOf))].sort();

    const heading = terms.length
      ? `${scored.length} ${scored.length === 1 ? 'recipe' : 'recipes'} with ${esc(terms.join(', '))}`
      : `${title} <span class="count">${scored.length}</span>`;

    main.innerHTML = `
      <section class="hero wrap">
        <div class="hero-main">
          <h1>Cook from<br><i>what you've got.</i></h1>
          <div class="search-card">
            <label class="eyebrow" for="ing">Ingredients on hand</label>
            <div class="tag-input">
              ${terms.map((t, i) => `<span class="tag">${esc(t)} <button type="button" data-remove="${i}" aria-label="Remove ${esc(t)}">×</button></span>`).join('')}
              <input id="ing" autocomplete="off" placeholder="${terms.length ? 'add another…' : 'chicken, lemon, capers…'}" enterkeyhint="search">
            </div>
            ${suggestions.length ? `<div class="suggest"><span>Try:</span>${suggestions.map((s) => `<button type="button" class="chip" data-add="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
            ${matchLine ? `<p class="match-line" aria-live="polite">${matchLine}</p>` : ''}
          </div>
        </div>
        <div class="find-panel">
          <h2 class="find-title">Know what<br><i>you want?</i></h2>
          ${findForm('')}
          ${tries.length ? `<div class="find-try"><span>Try searching</span><div>${tries.map((t) => `<a class="chip" href="#/search?q=${encodeURIComponent(t.toLowerCase())}">${esc(t)}</a>`).join('')}</div></div>` : ''}
        </div>
      </section>
      <section class="results wrap">
        <div class="results-bar">
          <h2>${heading}</h2>
          <div class="filters">
          <button type="button" class="filter" data-meal="" aria-pressed="${!state.meal}">Everything</button>
          ${meals.map((m) => `<button type="button" class="filter" data-meal="${esc(m)}" aria-pressed="${state.meal === m}">${icon(categoryIcon({ mealTypes: [m] }))}${esc(m)}</button>`).join('')}
          <button type="button" class="filter" data-toggle="kid" aria-pressed="${state.kid}">${icon('kid-friendly')}Kid can make</button>
          <button type="button" class="filter" data-toggle="quick" aria-pressed="${state.quick}">${icon('quick')}Under 30 min</button>
          </div>
        </div>
        ${scored.length ? `<div class="grid">${scored.map(({ r, hits }) => card(r, hits, terms.length)).join('')}</div>`
          : `<div class="empty">No recipes match yet. Try fewer ingredients or clear a filter.</div>`}
      </section>`;

    wireFind(false);
    const input = document.getElementById('ing');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const add = input.value.split(',').map(norm).filter(Boolean);
        if (add.length) setTerms([...new Set([...terms, ...add])]);
      } else if (e.key === 'Backspace' && !input.value && terms.length) {
        setTerms(terms.slice(0, -1));
      }
    });
    main.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => setTerms(terms.filter((_, i) => i !== +b.dataset.remove))));
    main.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => setTerms([...terms, norm(b.dataset.add)])));
    main.querySelectorAll('[data-meal]').forEach((b) => b.addEventListener('click', () => { state.meal = b.dataset.meal || null; renderHome(view); }));
    main.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => { state[b.dataset.toggle] = !state[b.dataset.toggle]; renderHome(view); }));
    if (terms.length) input.focus({ preventScroll: true });
  }

  function card(r, hits, nTerms, opts = {}) {
    const meta = [
      timeLabel(r) ? `<span>${icon('prep-time')}${esc(timeLabel(r))}</span>` : '',
      r.servings ? `<span>${icon('servings')}serves ${esc(r.servings)}</span>` : '',
      r.rating ? `<span>${esc(stars(r.rating))}</span>` : '',
    ].filter(Boolean).join('');
    const partial = nTerms && hits < nTerms ? `<span class="badge">uses ${hits} of ${nTerms}</span>` : '';
    const fav = !partial && r.status === 'Family Favorite' ? `<span class="badge">${icon('favorite')}Family favorite</span>` : '';
    return `<a class="card" href="#/recipe/${esc(r.slug)}">
      ${thumb(r, 'thumb')}
      <div class="card-body">${partial || fav}<div class="card-title">${opts.title || esc(r.name)}</div><div class="card-meta">${meta}</div>${opts.snippet ? `<div class="snippet">${opts.snippet}</div>` : ''}</div>
    </a>`;
  }

  // ---------- full-text search ----------
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordRe = (t) => new RegExp('\\b' + reEsc(singular(t)), 'i');

  function fieldsOf(r) {
    const f = [{ label: 'Name', text: r.name, w: 10 }];
    const tags = [r.cuisine, ...mealsOf(r), ...(r.occasion || []), ...(r.keyIngredients || []), ...(r.method || [])].filter(Boolean);
    if (tags.length) f.push({ label: 'Tags', text: tags.join(' · '), w: 5 });
    (r.ingredientGroups || []).forEach((g) => g.items.forEach((it) => f.push({ label: 'Ingredient', text: unlink(it), w: 3 })));
    (r.notes || []).forEach((n) => f.push({ label: 'Note', text: unlink(n), w: 2 }));
    (r.steps || []).forEach((s, i) => f.push({ label: 'Step ' + (i + 1), text: unlink(s), w: 1 }));
    if (r.source) f.push({ label: 'From', text: r.source, w: 1 });
    return f;
  }

  function highlight(text, tokens) {
    let out = esc(text);
    tokens.forEach((t) => { out = out.replace(new RegExp('\\b(' + reEsc(esc(singular(t))) + '[\\w\\u00C0-\\u024F]*)', 'gi'), '<mark>$1</mark>'); });
    return out;
  }

  function clip(text, tokens, max = 120) {
    if (text.length <= max) return text;
    const m = text.search(wordRe(tokens.find((t) => wordRe(t).test(text)) || tokens[0]));
    const start = Math.max(0, Math.min(m - 30, text.length - max));
    return (start ? '…' : '') + text.slice(start, start + max).trim() + (start + max < text.length ? '…' : '');
  }

  function search(q) {
    const tokens = norm(q).split(/[\s,]+/).filter((t) => t.length > 1 || /\d/.test(t));
    if (!tokens.length) return { tokens, results: [] };
    const results = [];
    for (const r of visible()) {
      const fields = fieldsOf(r);
      let score = 0, best = null, ok = true;
      for (const t of tokens) {
        const re = wordRe(t);
        const hits = fields.filter((f) => re.test(f.text));
        if (!hits.length) { ok = false; break; }
        score += Math.max(...hits.map((h) => h.w));
        const detail = hits.find((h) => h.label !== 'Name' && h.label !== 'Tags');
        if (detail && (!best || detail.w > best.w)) best = detail;
      }
      if (!ok) continue;
      if (norm(r.name).includes(norm(q))) score += 20;
      if (r.status === 'Family Favorite') score += 1;
      results.push({ r, score, best });
    }
    results.sort((a, b) => b.score - a.score || a.r.name.localeCompare(b.r.name));
    return { tokens, results };
  }

  function findForm(value) {
    return `<form class="find-form" role="search" id="find-form">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <label class="sr-only" for="q">Search recipes</label>
            <input id="q" type="search" autocomplete="off" value="${esc(value)}" placeholder="Search recipes…" enterkeyhint="search">
            <button type="submit">Search</button>
          </form>`;
  }

  // live = true on the search page: typing updates results in place without leaving the box.
  function wireFind(live) {
    const form = document.getElementById('find-form');
    const box = document.getElementById('q');
    if (!form || !box) return;
    let timer;
    const go = (immediate) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const v = box.value.trim();
        const target = '#/search' + (v ? '?q=' + encodeURIComponent(v) : '');
        if (live) location.replace(target);
        else if (v) location.hash = target;
      }, immediate ? 0 : 180);
    };
    if (live) box.addEventListener('input', () => go(false));
    form.addEventListener('submit', (e) => { e.preventDefault(); go(true); });
  }

  function renderSearch(q) {
    const { tokens, results } = search(q);
    document.title = (q ? `"${q}" · ` : '') + 'Search · Our Family Table';
    if (!document.getElementById('search-page')) {
      main.innerHTML = `
        <section class="search-page wrap" id="search-page">
          <div class="find-panel">
            <h1 class="find-title">Know what <i>you want?</i></h1>
            ${findForm(q)}
            <p class="find-status" id="find-status" aria-live="polite"></p>
          </div>
        </section>
        <section class="results wrap" id="search-results"></section>`;
      wireFind(true);
      const box = document.getElementById('q');
      box.focus({ preventScroll: true });
      box.setSelectionRange(box.value.length, box.value.length);
    }
    document.getElementById('find-status').innerHTML = !tokens.length
      ? 'Search names, ingredients, steps and notes. Try a dish, an ingredient, a person (“Grandma”), or a word from the notes.'
      : `<b>${results.length} ${results.length === 1 ? 'recipe' : 'recipes'}</b> for “${esc(q.trim())}”`;
    document.getElementById('search-results').innerHTML = results.length
      ? `<div class="grid">${results.map(({ r, best }) => card(r, 0, 0, {
          title: highlight(r.name, tokens),
          snippet: best ? `<b>${esc(best.label)}:</b> ${highlight(clip(best.text, tokens), tokens)}` : '',
        })).join('')}</div>`
      : tokens.length ? `<div class="empty">Nothing matches “${esc(q.trim())}”. Check the spelling, try fewer words, or <a href="#/?i=${encodeURIComponent(tokens.join(','))}">search by ingredient</a> instead.</div>` : '';
  }

  // "/" jumps to whichever search box is on the page.
  function wireSlashKey() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || cook || e.metaKey || e.ctrlKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
      const box = document.getElementById('q');
      if (!box) return;
      e.preventDefault();
      box.focus();
      box.select();
    });
  }


  // ---------- recipe page ----------
  function renderRecipe(slug) {
    const r = state.recipes.find((x) => x.slug === slug);
    if (!r) { main.innerHTML = `<section class="wrap recipe"><a class="back" href="#/">← All recipes</a><div class="empty">That recipe isn't in the book.</div></section>`; return; }
    document.title = r.name + ' · Our Family Table';
    const tags = [r.cuisine, ...mealsOf(r), ...(r.occasion || [])].filter(Boolean);
    const stat = (label, val, ic) => val ? `<div class="stat"><div class="stat-label">${icon(ic)}${label}</div><div class="stat-value">${esc(val)}</div></div>` : '';
    let n = 0;
    main.innerHTML = `
      <section class="wrap recipe">
        <a class="back" href="javascript:history.back()">← Back</a>
        <article class="recipe-card">
          <div class="recipe-side">
            <span class="eyebrow">${esc([r.cuisine, mealsOf(r).join(' / ')].filter(Boolean).join(' · ') || 'Recipe')}</span>
            <h1>${esc(r.name)}</h1>
            <div class="stats">${stat('SERVES', r.servings, 'servings')}${stat('PREP', mins(r.prep), 'prep-time')}${stat('COOK', mins(r.cook), 'cook-time')}</div>
            ${tags.length ? `<div class="tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
            ${r.photo ? thumb(r, 'hero-photo photo-top') : ''}
            <h2>Ingredients</h2>
            <div class="ing-groups">${(r.ingredientGroups || []).map((g) => `
              <div class="ing-group">
              ${g.label ? `<p class="group-label">${esc(g.label)}</p>` : ''}
              <div class="checklist">${g.items.map((it) => `<label><input type="checkbox" id="i${n++}"><span>${rich(it)}</span></label>`).join('')}</div>
              </div>`).join('')}</div>
            ${r.source ? `<p class="source">From ${r.sourceLink ? `<a href="${esc(r.sourceLink)}" rel="noopener">${esc(r.source)}</a>` : esc(r.source)}</p>` : ''}
          </div>
          <div class="recipe-main">
            ${thumb(r, 'hero-photo')}
            <h2>Instructions</h2>
            ${(r.steps || []).map((s, i) => `<div class="step"><span class="step-num">${i + 1}</span><p>${rich(s)}</p></div>`).join('')}
          </div>
          ${(r.notes || []).length || (r.related || []).length ? `<aside class="notes">
            ${(r.notes || []).length ? `<h2>Notes &amp; variations</h2><ul>${r.notes.map((x) => `<li>${rich(x)}</li>`).join('')}</ul>` : ''}
            ${(r.related || []).length ? `<div class="related"><h2>Related recipes</h2><ul>${r.related.map((x) => `<li><a class="inline-link" href="#/recipe/${esc(x.slug)}">${esc(x.name)}</a></li>`).join('')}</ul></div>` : ''}
          </aside>` : ''}
          <div class="actions">
              ${(r.steps || []).length ? `<button type="button" class="btn" id="cook-btn">${icon('timer')}Start cooking mode</button>` : ''}
              <button type="button" class="btn btn-ghost" data-act="add-recipe" data-slug="${esc(r.slug)}">${icon('meal-plan')}Add to meal plan</button>
              <button type="button" class="btn btn-ghost" id="print-btn">${icon('print')}Print card</button>
              <p class="print-hint" id="print-hint" hidden>No print menu? Tap your browser's <b>Share</b> button, then <b>Print</b>.</p>
            </div>
        </article>
      </section>
      <div class="cook" id="cook" hidden role="dialog" aria-modal="true" aria-label="Cooking mode"></div>`;
    const btn = document.getElementById('cook-btn');
    if (btn) btn.addEventListener('click', () => openCook(r));
    document.getElementById('print-btn').addEventListener('click', () => printCard(r));
    window.scrollTo(0, 0);
  }

  const mins = (m) => { if (!m) return ''; if (m < 60) return m + ' min'; const h = Math.floor(m / 60), r = m % 60; return h + ' hr' + (r ? ' ' + r + ' min' : ''); };

  // ---------- printing ----------
  // Saved-to-home-screen apps on iPhone can't open the print menu, so hand the page to the browser instead.
  const isStandalone = () => window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  const isTouch = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  function printCard(r) {
    if (isStandalone()) {
      window.open(location.href.split('#')[0] + '#/recipe/' + encodeURIComponent(r.slug) + '?print=1', '_blank');
      return;
    }
    try { if (typeof window.print === 'function') window.print(); } catch (_) { /* fall through to the hint */ }
    if (isTouch() || typeof window.print !== 'function') {
      const hint = document.getElementById('print-hint');
      if (hint) hint.hidden = false;
    }
  }

  // ---------- cooking mode ----------
  async function openCook(r) {
    cook = { r, i: 0, lock: null };
    try { if ('wakeLock' in navigator) cook.lock = await navigator.wakeLock.request('screen'); } catch (_) { /* screen may still sleep */ }
    document.addEventListener('keydown', cookKeys);
    drawCook();
  }
  // ---------- which ingredients each step uses ----------
  const UNITS = new Set('tsp teaspoon teaspoons tbsp tablespoon tablespoons tbs cup cups c oz ounce ounces lb lbs pound pounds g gram grams kg ml l liter liters quart quarts qt pint pints pinch pinches dash dashes can cans package packages pkg pkgs stick sticks slice slices sprig sprigs bunch bunches handful handfuls piece pieces inch inches jar jars bag bags box boxes container containers envelope envelopes'.split(' '));
  const DESCRIPTORS = new Set('large small medium big fresh freshly chopped minced diced sliced divided boneless skinless drained rinsed softened melted room temperature packed finely roughly coarsely thinly thick thin grated shredded peeled cut into about plus more for to taste optional and of the a an cold warm hot cubed beaten lightly extra virgin whole halved trimmed crushed heaping level scant generous good quality store bought homemade or each serving garnish needed'.split(' '));
  const CONTAINERS = new Set(['clove', 'head', 'stalk', 'ear', 'leaf', 'leave', 'fillet', 'filet']);
  const SYNONYMS = { spaghetti: 'pasta', penne: 'pasta', linguine: 'pasta', fettuccine: 'pasta', macaroni: 'pasta', rigatoni: 'pasta', orzo: 'pasta', noodle: 'pasta', hair: 'pasta', scallion: 'onion', shallot: 'onion' };

  const GENERIC_HEADS = new Set(['sauce', 'juice', 'zest', 'oil', 'powder', 'paste', 'extract', 'seed', 'flake', 'chip', 'mix', 'seasoning', 'dressing', 'vinegar', 'breast', 'thigh', 'wing', 'leg', 'drumstick', 'tenderloin', 'cutlet', 'fillet', 'chop', 'loin', 'steak']);
  const skipWord = (w) => w.length < 3 || UNITS.has(w) || DESCRIPTORS.has(w) || CONTAINERS.has(w)
    || UNITS.has(singular(w)) || DESCRIPTORS.has(singular(w)) || CONTAINERS.has(singular(w)) || CONTAINERS.has(w.replace(/s$/, ''));

  function keysFrom(text) {
    const words = text.split(/[^a-z]+/).filter(Boolean).filter((w) => !skipWord(w));
    if (!words.length) return [];
    const head = singular(words[words.length - 1]);
    const keys = [head];
    if (GENERIC_HEADS.has(head) && words.length > 1) keys.push(singular(words[words.length - 2]));
    return keys;
  }

  function ingredientKeys(line) {
    const clean = line.toLowerCase().replace(/\([^)]*\)/g, ' ');
    return clean.split(/\bor\b/).flatMap((alt) => {
      const beforeComma = keysFrom(alt.split(',')[0]);
      return beforeComma.length ? beforeComma : keysFrom(alt);
    }).flatMap((k) => (SYNONYMS[k] ? [k, SYNONYMS[k]] : [k]));
  }

  function stepIngredients(r, stepText) {
    const text = stepText.toLowerCase();
    const items = (r.ingredientGroups || []).flatMap((g) => g.items);
    return items.filter((line) => ingredientKeys(line).some((k) => new RegExp('\\b' + reEsc(k) + '(e?s|ed|ing)?\\b').test(text)));
  }

  function drawCook() {
    const el = document.getElementById('cook');
    if (!el || !cook) return;
    const steps = cook.r.steps, i = cook.i, last = i === steps.length - 1;
    const used = stepIngredients(cook.r, steps[i]);
    el.hidden = false;
    el.innerHTML = `
      <div class="cook-top">
        <div class="cook-progress" aria-hidden="true">${steps.map((_, k) => `<span class="${k <= i ? 'done' : ''}"></span>`).join('')}</div>
        <button type="button" class="btn btn-ghost" data-c="all" aria-pressed="${!!cook.all}">${cook.all ? 'This step only' : 'All ingredients'}</button>
        <button type="button" class="btn btn-ghost" data-c="close">Close</button>
      </div>
      <div class="cook-body">
        <div class="cook-step"><span class="eyebrow" style="color:var(--sand)">${esc(cook.r.name)} · Step ${i + 1} of ${steps.length}</span><p>${rich(steps[i])}</p></div>
        ${cook.all
          ? `<aside class="cook-ings" aria-label="All ingredients"><h2>All ingredients</h2>${(cook.r.ingredientGroups || []).map((g) => `${g.label ? `<h3>${esc(g.label)}</h3>` : ''}<ul>${g.items.map((it) => `<li>${esc(it)}</li>`).join('')}</ul>`).join('')}</aside>`
          : used.length ? `<aside class="cook-ings" aria-label="Ingredients for this step"><h2>For this step</h2><ul>${used.map((it) => `<li>${esc(it)}</li>`).join('')}</ul></aside>` : ''}
      </div>
      <div class="cook-nav">
        <button type="button" class="btn btn-ghost" data-c="prev" ${i === 0 ? 'disabled' : ''}>← Back</button>
        <button type="button" class="btn" data-c="${last ? 'close' : 'next'}">${last ? 'Done' : 'Next step →'}</button>
      </div>`;
    el.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => cookAct(b.dataset.c)));
    el.querySelector('[data-c="' + (last ? 'close' : 'next') + '"]').focus();
  }
  function cookAct(a) {
    if (!cook) return;
    if (a === 'next' && cook.i < cook.r.steps.length - 1) cook.i++;
    else if (a === 'prev' && cook.i > 0) cook.i--;
    else if (a === 'close') return closeCook();
    else if (a === 'all') cook.all = !cook.all;
    drawCook();
  }
  function cookKeys(e) {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); cookAct('next'); }
    else if (e.key === 'ArrowLeft') cookAct('prev');
    else if (e.key === 'Escape') closeCook();
  }
  function closeCook() {
    if (!cook) return;
    try { cook.lock && cook.lock.release(); } catch (_) {}
    cook = null;
    document.removeEventListener('keydown', cookKeys);
    const el = document.getElementById('cook');
    if (el) { el.hidden = true; el.innerHTML = ''; }
    const btn = document.getElementById('cook-btn');
    if (btn) btn.focus();
  }

  // ---------- meal plan ----------
  // The plan is a map of date ("2026-12-01") → { slug } or { note: "Leftovers" }.
  // planStore is the only place that reads or writes it, so it can later talk to Notion instead of this browser.
  const PLAN_KEY = 'oft-plan-v1';
  const GROCERY_KEY = 'oft-grocery-v1';
  const browserStore = (() => {
    const mem = {};
    let ok = false;
    try { localStorage.setItem('oft-test', '1'); localStorage.removeItem('oft-test'); ok = true; } catch (_) { /* private mode */ }
    return {
      ok,
      get(k, fallback) {
        if (!ok) return mem[k] ?? fallback;
        try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (_) { return fallback; }
      },
      set(k, v) {
        if (!ok) { mem[k] = v; return; }
        try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { mem[k] = v; }
      },
    };
  })();
  const planStore = {
    all() { return browserStore.get(PLAN_KEY, {}); },
    get(date) { return this.all()[date] || null; },
    set(date, entry) {
      const p = this.all();
      if (entry) p[date] = entry; else delete p[date];
      browserStore.set(PLAN_KEY, p);
    },
  };

  const NOTES = ['Leftovers', 'Eating out'];
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseYmd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
  const todayD = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
  const fmt = (d, o) => d.toLocaleDateString(undefined, o);
  const dayName = (d) => fmt(d, { weekday: 'long' });
  const shortDate = (d) => fmt(d, { weekday: 'short', month: 'short', day: 'numeric' });
  const bySlug = (slug) => state.recipes.find((r) => r.slug === slug && r.status !== 'Retired');

  // Surprise-me filters. Dinner by default, since that's the nightly question.
  const sp = { meal: 'Dinner', cuisine: null, kid: false, quick: false, pick: null };
  function surprisePool() {
    return visible().filter((r) => (!sp.meal || mealsOf(r).includes(sp.meal)) && (!sp.cuisine || r.cuisine === sp.cuisine)
      && (!sp.kid || (r.occasion || []).includes('Kid Can Make')) && (!sp.quick || isQuick(r)));
  }
  function randomFrom(pool, avoid = []) {
    const fresh = pool.filter((r) => !avoid.includes(r.slug));
    const from = fresh.length ? fresh : pool;
    return from.length ? from[Math.floor(Math.random() * from.length)] : null;
  }
  function dinnerPool() {
    const d = visible().filter((r) => mealsOf(r).includes('Dinner'));
    return d.length ? d : visible();
  }
  function shuffleSurprise() {
    const r = randomFrom(surprisePool(), sp.pick ? [sp.pick] : []);
    sp.pick = r ? r.slug : null;
  }
  // Slugs planned within 3 days of a date, so random picks don't repeat a dinner back to back.
  function nearbySlugs(date, plan) {
    const d = parseYmd(date), out = [];
    for (let k = -3; k <= 3; k++) { const e = plan[ymd(addDays(d, k))]; if (e && e.slug) out.push(e.slug); }
    return out;
  }
  function fillDays(dates) {
    const plan = planStore.all();
    let n = 0;
    dates.forEach((date) => {
      if (plan[date]) return;
      const r = randomFrom(dinnerPool(), nearbySlugs(date, plan));
      if (r) { plan[date] = { slug: r.slug }; n++; }
    });
    browserStore.set(PLAN_KEY, plan);
    return n;
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(html, undo) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.innerHTML = `<span>${html}</span>${undo ? '<button type="button" class="toast-undo">Undo</button>' : ''}`;
    el.hidden = false;
    if (undo) el.querySelector('.toast-undo').addEventListener('click', () => { undo(); el.hidden = true; });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 6000);
  }

  // Set one night and offer to undo it.
  function setNight(date, entry, label) {
    const before = planStore.get(date);
    planStore.set(date, entry);
    rerenderPlan();
    const d = parseYmd(date);
    toast(label || `Planned for ${esc(shortDate(d))}`, () => { planStore.set(date, before); rerenderPlan(); });
  }

  function rerenderPlan() {
    const view = parseHash().parts[0];
    if (view !== 'plan' && view !== 'surprise') return;
    const y = window.scrollY;
    const focusId = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.focus : null;
    route();
    window.scrollTo(0, y);
    if (focusId) { const el = main.querySelector(`[data-focus="${focusId}"]`); if (el) el.focus({ preventScroll: true }); }
  }

  // ---------- recipe chooser (dialog) ----------
  function openChooser(date) {
    const d = parseYmd(date);
    let dlg = document.getElementById('chooser');
    if (dlg) dlg.remove();
    dlg = document.createElement('dialog');
    dlg.id = 'chooser';
    dlg.className = 'chooser';
    dlg.setAttribute('aria-labelledby', 'chooser-title');
    dlg.innerHTML = `
      <div class="chooser-head">
        <div><span class="eyebrow">${esc(dayName(d))}</span><h2 id="chooser-title">${esc(fmt(d, { month: 'long', day: 'numeric' }))}</h2></div>
        <button type="button" class="icon-btn" data-close aria-label="Close">${icon('close')}</button>
      </div>
      <label class="sr-only" for="chooser-q">Find a recipe</label>
      <div class="find-form chooser-search">${'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'}<input id="chooser-q" type="search" autocomplete="off" placeholder="Find a recipe…"></div>
      <div class="chooser-quick">
        <button type="button" class="chip" data-pick-random>${icon('dice')}Pick for me</button>
        ${NOTES.map((n) => `<button type="button" class="chip" data-pick-note="${esc(n)}">${esc(n)}</button>`).join('')}
      </div>
      <ul class="chooser-list" id="chooser-list"></ul>`;
    document.body.appendChild(dlg);
    const list = dlg.querySelector('#chooser-list');
    const q = dlg.querySelector('#chooser-q');
    const draw = () => {
      const v = q.value.trim();
      const rs = v ? search(v).results.map((x) => x.r)
        : visible().slice().sort((a, b) => mealsOf(b).includes('Dinner') - mealsOf(a).includes('Dinner') || a.name.localeCompare(b.name));
      list.innerHTML = rs.length
        ? rs.map((r) => `<li><button type="button" class="chooser-item" data-pick="${esc(r.slug)}">${thumb(r, 'chooser-thumb')}<span><b>${esc(r.name)}</b><small>${esc([mealsOf(r).join(' / '), timeLabel(r)].filter(Boolean).join(' · '))}</small></span></button></li>`).join('')
        : `<li class="chooser-none">No recipes match “${esc(v)}”.</li>`;
    };
    draw();
    q.addEventListener('input', draw);
    const done = (entry, label) => { dlg.close(); setNight(date, entry, label); };
    dlg.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (e.target === dlg || (t && t.hasAttribute('data-close'))) return dlg.close();
      if (!t) return;
      if (t.dataset.pick) done({ slug: t.dataset.pick });
      else if (t.dataset.pickNote) done({ note: t.dataset.pickNote });
      else if (t.hasAttribute('data-pick-random')) {
        const r = randomFrom(dinnerPool(), nearbySlugs(date, planStore.all()));
        if (r) done({ slug: r.slug }, `${esc(r.name)} for ${esc(shortDate(d))}`);
      }
    });
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
    q.focus();
  }

  // ---------- add-to-plan (dialog, from a recipe page or Surprise me) ----------
  function openNightPicker(slug) {
    const r = bySlug(slug);
    if (!r) return;
    let dlg = document.getElementById('nights');
    if (dlg) dlg.remove();
    dlg = document.createElement('dialog');
    dlg.id = 'nights';
    dlg.className = 'chooser';
    dlg.setAttribute('aria-labelledby', 'nights-title');
    const plan = planStore.all();
    const start = todayD();
    const days = Array.from({ length: 14 }, (_, k) => addDays(start, k));
    dlg.innerHTML = `
      <div class="chooser-head">
        <div><span class="eyebrow">Add to meal plan</span><h2 id="nights-title">${esc(r.name)}</h2></div>
        <button type="button" class="icon-btn" data-close aria-label="Close">${icon('close')}</button>
      </div>
      <p class="chooser-hint">Pick a night. A night that's already planned gets replaced.</p>
      <div class="night-grid">${days.map((d) => {
        const e = plan[ymd(d)];
        const what = e ? (e.slug ? (bySlug(e.slug) || {}).name || 'Planned' : e.note) : 'Open';
        return `<button type="button" class="night ${e ? 'is-set' : ''}" data-night="${ymd(d)}"><b>${esc(fmt(d, { weekday: 'short' }))} ${d.getDate()}</b><small>${esc(what)}</small></button>`;
      }).join('')}</div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (e.target === dlg || (t && t.hasAttribute('data-close'))) return dlg.close();
      if (t && t.dataset.night) {
        dlg.close();
        const date = t.dataset.night;
        const before = planStore.get(date);
        planStore.set(date, { slug });
        rerenderPlan();
        toast(`${esc(r.name)} is on for ${esc(shortDate(parseYmd(date)))} · <a href="#/plan?w=${ymd(mondayOf(parseYmd(date)))}">See the week</a>`,
          () => { planStore.set(date, before); rerenderPlan(); });
      }
    });
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
    const first = dlg.querySelector('.night:not(.is-set)') || dlg.querySelector('.night');
    if (first) first.focus();
  }

  // ---------- Surprise me panel ----------
  function surprisePanel(big) {
    const all = visible();
    const meals = [...new Set(all.flatMap(mealsOf))].sort();
    const cuisines = [...new Set(all.map((r) => r.cuisine).filter(Boolean))].sort();
    if (sp.pick && !surprisePool().some((r) => r.slug === sp.pick)) sp.pick = null;
    if (!sp.pick) shuffleSurprise();
    const r = sp.pick ? bySlug(sp.pick) : null;
    const chip = (attr, val, on, label) => `<button type="button" class="filter" data-sp="${attr}" data-val="${esc(val)}" aria-pressed="${on}">${label}</button>`;
    const meta = r ? [timeLabel(r), r.servings ? 'serves ' + r.servings : '', r.cuisine].filter(Boolean).join(' · ') : '';
    const Tag = big ? 'h1' : 'h2';
    return `<div class="surprise ${big ? 'surprise-big' : ''}" id="surprise">
      <${Tag} class="surprise-title">Stuck? <i>Let the table pick.</i></${Tag}>
      <div class="sp-filters" role="group" aria-label="Kind of meal">
        ${chip('meal', '', !sp.meal, 'Any meal')}
        ${meals.map((m) => chip('meal', m, sp.meal === m, esc(m))).join('')}
        ${chip('quick', '1', sp.quick, icon('quick') + 'Under 30 min')}
        ${chip('kid', '1', sp.kid, icon('kid-friendly') + 'Kid can make')}
      </div>
      ${cuisines.length > 1 ? `<div class="sp-filters" role="group" aria-label="Cuisine">
        ${chip('cuisine', '', !sp.cuisine, 'Any cuisine')}
        ${cuisines.map((c) => chip('cuisine', c, sp.cuisine === c, esc(c))).join('')}
      </div>` : ''}
      ${r ? `<div class="sp-pick" aria-live="polite">
          <a href="#/recipe/${esc(r.slug)}" class="sp-photo" tabindex="-1" aria-hidden="true">${thumb(r, 'sp-thumb')}</a>
          <div class="sp-text">
            <span class="eyebrow">${sp.meal === 'Dinner' ? 'Tonight, how about…' : 'How about…'}</span>
            <a class="sp-name" href="#/recipe/${esc(r.slug)}">${esc(r.name)}</a>
            <span class="sp-meta">${esc(meta)}</span>
          </div>
        </div>
        <div class="sp-actions">
          <button type="button" class="btn" data-act="shuffle" data-focus="shuffle">${icon('shuffle')}Shuffle again</button>
          <a class="btn btn-ghost" href="#/recipe/${esc(r.slug)}">Let's make it</a>
          <button type="button" class="btn btn-ghost" data-act="add-pick">${icon('meal-plan')}Add to plan</button>
        </div>`
        : `<div class="empty">Nothing matches those filters. Try turning one off.</div>`}
    </div>`;
  }

  function renderSurprise() {
    document.title = 'Surprise me · Our Family Table';
    main.innerHTML = `<section class="wrap surprise-page">${surprisePanel(true)}</section>`;
  }

  // ---------- week view ----------
  function viewToggle(active, weekStart, month) {
    return `<div class="view-toggle" role="group" aria-label="Plan view">
      <a href="#/plan?w=${ymd(weekStart)}" ${active === 'week' ? 'aria-current="page"' : ''}>Week</a>
      <a href="#/plan/month?m=${month}" ${active === 'month' ? 'aria-current="page"' : ''}>Month</a>
    </div>`;
  }

  function dayCard(d, entry, isToday) {
    const date = ymd(d);
    const label = dayName(d);
    const head = `<div class="day-head"><span class="eyebrow">${esc(fmt(d, { weekday: 'short' }))}</span><span class="day-num">${d.getDate()}</span></div>`;
    let body;
    if (entry && entry.slug) {
      const r = bySlug(entry.slug);
      body = r
        ? `<a class="day-meal" href="#/recipe/${esc(r.slug)}">${thumb(r, 'day-thumb')}<span class="day-name">${esc(r.name)}</span><span class="day-meta">${esc(timeLabel(r))}</span></a>`
        : `<div class="day-note"><i>That recipe left the book</i></div>`;
    } else if (entry && entry.note) {
      body = `<div class="day-note"><i>${esc(entry.note)}</i><small>${entry.note === 'Leftovers' ? 'Fridge clean-out' : 'Night off'}</small></div>`;
    } else {
      body = `<div class="day-empty">
        <button type="button" class="btn btn-ghost" data-act="choose" data-date="${date}" data-focus="choose-${date}">+ Add</button>
        <button type="button" class="link-btn" data-act="roll" data-date="${date}" data-focus="roll-${date}">${icon('dice')}Pick for me</button>
      </div>`;
    }
    const tools = entry ? `<div class="day-tools">
        ${entry.slug ? `<button type="button" class="icon-btn" data-act="roll" data-date="${date}" data-focus="roll-${date}" aria-label="Pick a different dinner for ${esc(label)}" title="Pick a different one">${icon('shuffle')}</button>` : ''}
        <button type="button" class="icon-btn" data-act="choose" data-date="${date}" data-focus="choose-${date}" aria-label="Change ${esc(label)}" title="Change">${icon('notes')}</button>
        <button type="button" class="icon-btn" data-act="clear" data-date="${date}" aria-label="Clear ${esc(label)}" title="Clear">${icon('close')}</button>
      </div>` : '';
    return `<div class="day ${isToday ? 'is-today' : ''} ${entry ? '' : 'is-open'}">${head}${body}${tools}</div>`;
  }

  // Pantry staples that most kitchens already have; they're tucked under "You probably have these".
  const STAPLE = /\b(salt|black pepper|ground pepper|pepper to taste|olive oil|vegetable oil|canola oil|cooking spray|oil|water|flour|sugar|brown sugar|powdered sugar|baking soda|baking powder|vanilla|cinnamon|nutmeg|paprika|oregano|basil|thyme|cumin|chili powder|garlic powder|onion powder|italian seasoning|red pepper flakes|bay leaf|bay leaves|broth|stock|bouillon|soy sauce|vinegar|ketchup|mustard|mayonnaise|honey|cornstarch)\b/i;
  function groceryFor(dates, plan) {
    const seen = new Map();
    dates.forEach((date) => {
      const e = plan[date];
      const r = e && e.slug ? bySlug(e.slug) : null;
      if (!r) return;
      if (!seen.has(r.slug)) seen.set(r.slug, { r, nights: [] });
      seen.get(r.slug).nights.push(parseYmd(date));
    });
    const groups = [], staples = [];
    seen.forEach(({ r, nights }) => {
      const items = [];
      (r.ingredientGroups || []).forEach((g) => g.items.forEach((line, i) => {
        const text = unlink(line);
        const key = r.slug + '|' + (g.label || '') + '|' + i;
        (STAPLE.test(text) && !/\b(bell|jalape|chipotle|poblano)/i.test(text) ? staples : items).push({ key, text, from: r.name });
      }));
      groups.push({ r, nights, items });
    });
    return { groups, staples };
  }

  function groceryHtml(weekKey, dates, plan) {
    const { groups, staples } = groceryFor(dates, plan);
    const checked = browserStore.get(GROCERY_KEY, {})[weekKey] || {};
    const box = (it, showFrom) => `<label class="gl-item"><input type="checkbox" data-gl="${esc(it.key)}" ${checked[it.key] ? 'checked' : ''}><span>${esc(it.text)}${showFrom ? ` <small>· ${esc(it.from)}</small>` : ''}</span></label>`;
    return `<section class="wrap grocery" id="groceries" data-week="${weekKey}">
      <div class="grocery-card">
        <div class="grocery-top">
          <div><span class="eyebrow">Built from this week's plan</span><h2>Grocery <i>list</i></h2></div>
          ${groups.length ? `<div class="grocery-actions">
            <button type="button" class="btn" data-act="print-list">${icon('print')}Print list</button>
            <button type="button" class="btn btn-ghost" data-act="copy-list">${icon('shopping-list')}Copy list</button>
            <button type="button" class="link-btn" data-act="uncheck-list">Uncheck all</button>
          </div>` : ''}
        </div>
        ${groups.length ? `<div class="gl-groups">${groups.map((g) => `<div class="gl-group">
            <h3>${esc(g.r.name)} <small>${g.nights.map((d) => esc(fmt(d, { weekday: 'short' }))).join(', ')}</small></h3>
            ${g.items.length ? g.items.map((it) => box(it)).join('') : '<p class="gl-none">Nothing extra to buy.</p>'}
          </div>`).join('')}</div>
          ${staples.length ? `<details class="gl-staples"><summary>You probably have these (${staples.length})</summary><div class="gl-staple-list">${staples.map((it) => box(it, true)).join('')}</div></details>` : ''}`
          : `<p class="gl-none">Plan a few dinners and their ingredients show up here.</p>`}
      </div>
    </section>`;
  }

  function groceryText(weekKey, dates) {
    const { groups, staples } = groceryFor(dates, planStore.all());
    const checked = browserStore.get(GROCERY_KEY, {})[weekKey] || {};
    const lines = [];
    groups.forEach((g) => {
      const left = g.items.filter((it) => !checked[it.key]);
      if (!left.length) return;
      lines.push(g.r.name.toUpperCase());
      left.forEach((it) => lines.push('☐ ' + it.text));
      lines.push('');
    });
    const st = staples.filter((it) => !checked[it.key]);
    if (st.length) { lines.push('CHECK THE PANTRY'); st.forEach((it) => lines.push('☐ ' + it.text)); }
    return lines.join('\n').trim();
  }

  function renderWeek(params) {
    const start = mondayOf(parseYmd(params.get('w')) || todayD());
    const today = todayD();
    const dates = Array.from({ length: 7 }, (_, k) => addDays(start, k));
    const plan = planStore.all();
    const thisWeek = ymd(start) === ymd(mondayOf(today));
    const end = dates[6];
    const range = fmt(start, { month: 'short', day: 'numeric' }) + ' – ' + fmt(end, start.getMonth() === end.getMonth() ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
    const planned = dates.filter((d) => plan[ymd(d)]).length;
    const open = 7 - planned;
    const notes = dates.filter((d) => plan[ymd(d)] && plan[ymd(d)].note).length;
    const summary = planned === 0 ? 'Nothing planned yet.'
      : `${planned} of 7 nights planned` + (open ? ` · ${open} open` : '') + (notes ? ` · ${notes} night${notes > 1 ? 's' : ''} off the stove` : '');
    document.title = 'Meal plan · Our Family Table';
    main.innerHTML = `
      <section class="wrap plan-hero">
        <div class="plan-head">
          <div class="plan-head-text">
            <span class="eyebrow">${thisWeek ? 'This week' : 'Week of'} · ${esc(range)}</span>
            <h1>What's for<br><i>dinner this week.</i></h1>
            <p>${esc(summary)}</p>
          </div>
          <div class="plan-head-actions">
            ${viewToggle('week', start, ymd(start).slice(0, 7))}
            ${open ? `<button type="button" class="btn btn-light" data-act="fill-week" data-focus="fill-week">${icon('dice')}Fill ${open === 7 ? 'the week' : open === 1 ? 'the open night' : `${open} open nights`} for me</button>` : ''}
            <button type="button" class="btn btn-outline-light" data-act="to-groceries">${icon('shopping-list')}Grocery list</button>
            ${planned ? `<button type="button" class="btn btn-outline-light" data-act="reset-week" data-w="${ymd(start)}" data-focus="reset-week">${icon('close')}Clear week</button>` : ''}
          </div>
        </div>
        ${surprisePanel(false)}
      </section>
      <section class="wrap week">
        <div class="week-bar">
          <h2>The week</h2>
          <div class="week-nav">
            <a class="icon-btn" href="#/plan?w=${ymd(addDays(start, -7))}" aria-label="Previous week">${icon('chev-l')}</a>
            ${thisWeek ? '' : `<a class="btn btn-ghost" href="#/plan">This week</a>`}
            <a class="icon-btn" href="#/plan?w=${ymd(addDays(start, 7))}" aria-label="Next week">${icon('chev-r')}</a>
          </div>
        </div>
        <div class="week-grid">${dates.map((d) => dayCard(d, plan[ymd(d)], ymd(d) === ymd(today))).join('')}</div>
        ${browserStore.ok ? '<p class="plan-foot">Saved on this device. Other phones and computers have their own plan for now.</p>'
          : '<p class="plan-foot">This browser won\'t let the site save, so the plan disappears when you close the page. Private browsing often does this.</p>'}
      </section>
      ${groceryHtml(ymd(start), dates.map(ymd), plan)}`;
  }

  // ---------- month view ----------
  function renderMonth(params) {
    const m = /^(\d{4})-(\d{2})$/.exec(params.get('m') || '');
    const today = todayD();
    const first = m ? new Date(+m[1], +m[2] - 1, 1) : new Date(today.getFullYear(), today.getMonth(), 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const gridStart = mondayOf(first);
    const gridEnd = addDays(mondayOf(last), 6);
    const cells = [];
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) cells.push(d);
    const plan = planStore.all();
    const inMonth = (d) => d.getMonth() === first.getMonth();
    const monthDays = cells.filter(inMonth);
    const planned = monthDays.filter((d) => plan[ymd(d)]).length;
    const fillable = monthDays.filter((d) => d >= today && !plan[ymd(d)]).length;
    const mk = (d) => ymd(d).slice(0, 7);
    const prev = new Date(first.getFullYear(), first.getMonth() - 1, 1);
    const next = new Date(first.getFullYear(), first.getMonth() + 1, 1);
    const weekForToggle = first.getMonth() === today.getMonth() && first.getFullYear() === today.getFullYear() ? mondayOf(today) : mondayOf(first);
    document.title = fmt(first, { month: 'long', year: 'numeric' }) + ' · Meal plan · Our Family Table';
    main.innerHTML = `
      <section class="wrap month-top">
        <div>
          <span class="eyebrow">${planned} of ${monthDays.length} dinners planned</span>
          <h1>${esc(fmt(first, { month: 'long' }))} <i>${first.getFullYear()}</i></h1>
        </div>
        <div class="month-actions">
          ${viewToggle('month', weekForToggle, mk(first)).replace('view-toggle', 'view-toggle view-toggle-light')}
          <a class="icon-btn" href="#/plan/month?m=${mk(prev)}" aria-label="Previous month">${icon('chev-l')}</a>
          <a class="icon-btn" href="#/plan/month?m=${mk(next)}" aria-label="Next month">${icon('chev-r')}</a>
          ${fillable ? `<button type="button" class="btn btn-olive" data-act="fill-month" data-m="${mk(first)}" data-focus="fill-month">${icon('dice')}Fill ${fillable} open night${fillable > 1 ? 's' : ''}</button>` : ''}
          ${planned ? `<button type="button" class="btn btn-ghost" data-act="reset-month" data-m="${mk(first)}" data-focus="reset-month">${icon('close')}Clear month</button>` : ''}
        </div>
      </section>
      <section class="wrap">
        <div class="month">
          <div class="month-dow" aria-hidden="true">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((x) => `<span>${x}</span>`).join('')}</div>
          <div class="month-grid">${cells.map((d) => {
            const date = ymd(d), e = plan[date], r = e && e.slug ? bySlug(e.slug) : null;
            const cls = ['mcell', inMonth(d) ? '' : 'is-out', date === ymd(today) ? 'is-today' : ''].join(' ');
            const wd = `<span class="mday"><span class="mdow">${esc(fmt(d, { weekday: 'short' }))}</span>${d.getDate()}</span>`;
            if (!inMonth(d)) return `<div class="${cls}" aria-hidden="true">${wd}</div>`;
            let inner;
            if (e) inner = `${r ? `<a class="mmeal" href="#/recipe/${esc(r.slug)}">${esc(r.name)}</a>` : `<span class="mnote">${esc(e.note || 'Recipe left the book')}</span>`}
              <button type="button" class="mclear" data-act="clear" data-date="${date}" aria-label="Clear ${esc(fmt(d, { weekday: 'long', month: 'long', day: 'numeric' }))}">${icon('close')}</button>`;
            else inner = `<div class="madd"><button type="button" data-act="choose" data-date="${date}" data-focus="choose-${date}" aria-label="Plan ${esc(fmt(d, { weekday: 'long', month: 'long', day: 'numeric' }))}">+ Add</button><button type="button" class="icon-btn" data-act="roll" data-date="${date}" data-focus="roll-${date}" aria-label="Pick a dinner for ${esc(fmt(d, { month: 'long', day: 'numeric' }))}" title="Pick for me">${icon('dice')}</button></div>`;
            return `<div class="${cls} ${e ? 'is-set' : ''}">${wd}${inner}</div>`;
          }).join('')}</div>
        </div>
        <p class="plan-foot">Saved on this device. Tap a dinner to open the recipe.</p>
      </section>`;
  }

  function renderPlan(parts, params) {
    if (parts[1] === 'month') renderMonth(params); else renderWeek(params);
  }

  // One click handler for every planner button, so re-rendering never loses wiring.
  function wirePlanner() {
    main.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act], [data-sp]');
      if (!b || !main.contains(b)) return;
      if (b.dataset.sp) {
        const k = b.dataset.sp, v = b.dataset.val;
        if (k === 'meal') sp.meal = v || null;
        else if (k === 'cuisine') sp.cuisine = v || null;
        else sp[k] = !sp[k];
        sp.pick = null;
        return rerenderPlan();
      }
      const date = b.dataset.date;
      switch (b.dataset.act) {
        case 'shuffle': shuffleSurprise(); return rerenderPlan();
        case 'add-pick': if (sp.pick) openNightPicker(sp.pick); return;
        case 'add-recipe': openNightPicker(b.dataset.slug); return;
        case 'choose': openChooser(date); return;
        case 'roll': {
          const plan = planStore.all();
          const cur = plan[date] && plan[date].slug;
          const r = randomFrom(dinnerPool(), [...nearbySlugs(date, plan), cur].filter(Boolean));
          if (r) setNight(date, { slug: r.slug }, `${esc(r.name)} for ${esc(shortDate(parseYmd(date)))}`);
          return;
        }
        case 'clear': {
          const d = parseYmd(date);
          setNight(date, null, `Cleared ${esc(shortDate(d))}`);
          return;
        }
        case 'fill-week': case 'fill-month': {
          const before = planStore.all();
          let dates;
          if (b.dataset.act === 'fill-week') {
            const start = mondayOf(parseYmd(parseHash().params.get('w')) || todayD());
            dates = Array.from({ length: 7 }, (_, k) => ymd(addDays(start, k)));
          } else {
            const [y, mo] = b.dataset.m.split('-').map(Number);
            const today = todayD();
            dates = [];
            for (let d = new Date(y, mo - 1, 1); d.getMonth() === mo - 1; d = addDays(d, 1)) if (d >= today) dates.push(ymd(d));
          }
          const n = fillDays(dates);
          rerenderPlan();
          toast(n ? `Filled ${n} night${n > 1 ? 's' : ''}. Shuffle any you don't like.` : 'Add a few dinners to the book first.',
            n ? () => { browserStore.set(PLAN_KEY, before); rerenderPlan(); } : null);
          return;
        }
        case 'reset-week': case 'reset-month': {
          // Wipe the plan and the grocery checkmarks for this week or month, saved memory included.
          const isWeek = b.dataset.act === 'reset-week';
          let dates, label;
          if (isWeek) {
            const start = parseYmd(b.dataset.w);
            dates = Array.from({ length: 7 }, (_, k) => ymd(addDays(start, k)));
            label = 'this week';
          } else {
            const [y, mo] = b.dataset.m.split('-').map(Number);
            dates = [];
            for (let d = new Date(y, mo - 1, 1); d.getMonth() === mo - 1; d = addDays(d, 1)) dates.push(ymd(d));
            label = fmt(new Date(y, mo - 1, 1), { month: 'long' });
          }
          const planBefore = planStore.all();
          const groceryBefore = browserStore.get(GROCERY_KEY, {});
          const plan = JSON.parse(JSON.stringify(planBefore));
          const grocery = JSON.parse(JSON.stringify(groceryBefore));
          let n = 0;
          dates.forEach((d) => { if (plan[d]) { delete plan[d]; n++; } });
          // Grocery checks are saved per week (keyed by that week's Monday), so clear every week that touches these dates.
          const weeks = new Set(dates.map((d) => ymd(mondayOf(parseYmd(d)))));
          weeks.forEach((w) => { delete grocery[w]; });
          browserStore.set(PLAN_KEY, plan);
          browserStore.set(GROCERY_KEY, grocery);
          rerenderPlan();
          toast(`Cleared ${label}${n ? ` (${n} night${n > 1 ? 's' : ''})` : ''}.`,
            () => { browserStore.set(PLAN_KEY, planBefore); browserStore.set(GROCERY_KEY, groceryBefore); rerenderPlan(); });
          return;
        }
        case 'to-groceries': { const g = document.getElementById('groceries'); if (g) g.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
        case 'uncheck-list': {
          const wk = document.getElementById('groceries').dataset.week;
          const all = browserStore.get(GROCERY_KEY, {}); delete all[wk]; browserStore.set(GROCERY_KEY, all);
          main.querySelectorAll('[data-gl]').forEach((c) => { c.checked = false; });
          return;
        }
        case 'print-list': {
          document.body.classList.add('printing-list');
          const off = () => { document.body.classList.remove('printing-list'); window.removeEventListener('afterprint', off); };
          window.addEventListener('afterprint', off);
          try { window.print(); } catch (_) {}
          setTimeout(off, 1500);
          return;
        }
        case 'copy-list': {
          const wk = document.getElementById('groceries').dataset.week;
          const start = parseYmd(wk);
          const text = groceryText(wk, Array.from({ length: 7 }, (_, k) => ymd(addDays(start, k))));
          try { await navigator.clipboard.writeText(text); toast('Grocery list copied. Paste it into a text or your notes.'); }
          catch (_) { window.prompt('Copy your grocery list:', text); }
          return;
        }
      }
    });
    // Remember checked grocery items per week.
    main.addEventListener('change', (e) => {
      const c = e.target.closest('[data-gl]');
      if (!c) return;
      const wk = document.getElementById('groceries').dataset.week;
      const all = browserStore.get(GROCERY_KEY, {});
      all[wk] = all[wk] || {};
      if (c.checked) all[wk][c.dataset.gl] = 1; else delete all[wk][c.dataset.gl];
      browserStore.set(GROCERY_KEY, all);
    });
    // Another tab changed the plan: show it.
    window.addEventListener('storage', (e) => { if (e.key === PLAN_KEY) rerenderPlan(); });
  }

  // ---------- boot ----------
  async function boot() {
    try {
      const res = await fetch('data/recipes.json', { cache: 'no-cache' });
      const data = await res.json();
      state.recipes = data.recipes || [];
      if (data.updated) document.getElementById('updated').textContent = 'Updated ' + new Date(data.updated).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    } catch (e) {
      main.innerHTML = '<section class="wrap"><div class="empty">The recipe book couldn\'t load. Refresh to try again.</div></section>';
      return;
    }
    wireSlashKey();
    wirePlanner();
    window.addEventListener('hashchange', () => { document.title = 'Our Family Table'; route(); });
    route();
  }
  boot();
})();
