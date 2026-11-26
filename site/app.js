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
      "appetizer": "M12 2.5V5.7M12 11.3V13M12 18V21.5M12 2.5L15 3.5L12 4.5M9.2 8.5a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0 -5.6 0M8.5 13H15.5V18H8.5Z",
      "sauce": "M8 3.5H16V6.5H8ZM8.5 6.5C6.5 7.5 5.5 9 5.5 11V18C5.5 19.4 6.6 20.5 8 20.5H16C17.4 20.5 18.5 19.4 18.5 18V11C18.5 9 17.5 7.5 15.5 6.5M8.5 12H15.5V16.5H8.5Z",
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
      "notes": "M4 20L5 15.5L15.5 5C16.3 4.2 17.7 4.2 18.5 5L19 5.5C19.8 6.3 19.8 7.7 19 8.5L8.5 19ZM14 6.5L17.5 10"
  };
  const icon = (name, cls = 'ico') => ICON_PATHS[name]
    ? `<svg class="${cls}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON_PATHS[name]}"/></svg>`
    : '';
  // Pick a category icon from the recipe's meal type and cuisine.
  function categoryIcon(r) {
    const meal = norm(r.mealType), cuisine = norm(r.cuisine);
    const byMeal = { breakfast: 'breakfast', brunch: 'breakfast', dessert: 'dessert', soup: 'soup', salad: 'salad', bread: 'bread', baking: 'bread', drink: 'drinks', drinks: 'drinks', side: 'sides', sides: 'sides', lunch: 'sandwich', snack: 'cookie', snacks: 'cookie', appetizer: 'appetizer', appetizers: 'appetizer', 'sauce & staple': 'sauce', sauce: 'sauce', staple: 'sauce' };
    const byCuisine = { italian: 'pasta', asian: 'asian', chinese: 'asian', japanese: 'asian', thai: 'asian', korean: 'asian', vietnamese: 'asian', mexican: 'taco', 'tex-mex': 'taco', comfort: 'comfort', bbq: 'grill', seafood: 'fish' };
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
    const { parts, params } = parseHash();
    const view = parts[0] || 'home';
    document.querySelectorAll('[data-nav]').forEach((a) => {
      const on = a.dataset.nav === (view === 'recipe' ? '' : view);
      on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    });
    if (view === 'recipe') return renderRecipe(parts[1]);
    if (view === 'search') return renderSearch(params.get('q') || '');
    const box = document.getElementById('q');
    if (box && document.activeElement !== box) box.value = '';
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
    if (state.meal) scored = scored.filter((x) => x.r.mealType === state.meal);
    if (state.kid) scored = scored.filter((x) => (x.r.occasion || []).includes('Kid Can Make'));
    if (state.quick) scored = scored.filter((x) => isQuick(x.r));
    scored.sort((a, b) => b.hits - a.hits || (b.r.rating || 0) - (a.r.rating || 0) || a.r.name.localeCompare(b.r.name));

    const full = terms.length ? scored.filter((x) => x.hits === terms.length).length : scored.length;
    const partial = terms.length ? scored.length - full : 0;
    const matchText = !terms.length
      ? (scored.length === 1 ? 'recipe in the book.' : 'recipes in the book.')
      : (terms.length === 1 ? (full === 1 ? 'recipe uses it.' : 'recipes use it.') : (full === 1 ? 'recipe uses all of them.' : 'recipes use all of them.')) + (partial ? ` ${partial} more use${partial === 1 ? 's' : ''} some.` : '');

    const tagCounts = {};
    pool.forEach((r) => (r.keyIngredients || []).forEach((k) => { tagCounts[k] = (tagCounts[k] || 0) + 1; }));
    const suggestions = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(([k]) => k).filter((k) => !terms.includes(norm(k))).slice(0, 6);
    const meals = [...new Set(pool.map((r) => r.mealType).filter(Boolean))].sort();

    const heading = terms.length
      ? `${scored.length} ${scored.length === 1 ? 'recipe' : 'recipes'} with ${esc(terms.join(', '))}`
      : title;

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
          </div>
        </div>
        <div class="matches" aria-live="polite">
          <span class="eyebrow">${terms.length ? 'Matches' : 'Recipes'}</span>
          <div class="num">${full}</div>
          <p>${matchText}</p>
        </div>
      </section>
      <section class="results wrap">
        <div class="results-bar">
          <h2>${heading}</h2>
          <button type="button" class="filter" data-meal="" aria-pressed="${!state.meal}">Everything</button>
          ${meals.map((m) => `<button type="button" class="filter" data-meal="${esc(m)}" aria-pressed="${state.meal === m}">${icon(categoryIcon({ mealType: m }))}${esc(m)}</button>`).join('')}
          <button type="button" class="filter" data-toggle="kid" aria-pressed="${state.kid}">${icon('kid-friendly')}Kid can make</button>
          <button type="button" class="filter" data-toggle="quick" aria-pressed="${state.quick}">${icon('quick')}Under 30 min</button>
        </div>
        ${scored.length ? `<div class="grid">${scored.map(({ r, hits }) => card(r, hits, terms.length)).join('')}</div>`
          : `<div class="empty">No recipes match yet. Try fewer ingredients or clear a filter.</div>`}
      </section>`;

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
    const tags = [r.cuisine, r.mealType, ...(r.occasion || []), ...(r.keyIngredients || []), ...(r.method || [])].filter(Boolean);
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

  function renderSearch(q) {
    const box = document.getElementById('q');
    if (box && document.activeElement !== box) box.value = q;
    const { tokens, results } = search(q);
    document.title = (q ? `"${q}" · ` : '') + 'Search · Our Family Table';
    const heading = !tokens.length ? 'Search the recipe book'
      : `${results.length} ${results.length === 1 ? 'recipe' : 'recipes'} for “${esc(q.trim())}”`;
    main.innerHTML = `
      <section class="search-head wrap">
        <h1>${heading}</h1>
        <p>${tokens.length ? 'Searching names, ingredients, steps and notes.' : 'Try a dish, an ingredient, a person (“Grandma”), or a word from the notes.'}</p>
      </section>
      <section class="results wrap" style="padding-top: 24px">
        ${results.length ? `<div class="grid">${results.map(({ r, best }) => card(r, 0, 0, {
          title: highlight(r.name, tokens),
          snippet: best ? `<b>${esc(best.label)}:</b> ${highlight(clip(best.text, tokens), tokens)}` : '',
        })).join('')}</div>`
          : tokens.length ? `<div class="empty">Nothing matches “${esc(q.trim())}”. Check the spelling, try fewer words, or <a href="#/?i=${encodeURIComponent(tokens.join(','))}">search by ingredient</a> instead.</div>` : ''}
      </section>`;
  }

  function wireSearchBox() {
    const form = document.getElementById('site-search');
    const box = document.getElementById('q');
    if (!form || !box) return;
    let timer;
    const go = (immediate) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const v = box.value.trim();
        const onSearch = parseHash().parts[0] === 'search';
        const target = v ? '#/search?q=' + encodeURIComponent(v) : '#/';
        if (onSearch) location.replace(target);
        else if (v) location.hash = target;
      }, immediate ? 0 : 180);
    };
    box.addEventListener('input', () => go(false));
    form.addEventListener('submit', (e) => { e.preventDefault(); go(true); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || cook || e.metaKey || e.ctrlKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
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
    const tags = [r.cuisine, r.mealType, ...(r.occasion || [])].filter(Boolean);
    const stat = (label, val, ic) => val ? `<div class="stat"><div class="stat-label">${icon(ic)}${label}</div><div class="stat-value">${esc(val)}</div></div>` : '';
    let n = 0;
    main.innerHTML = `
      <section class="wrap recipe">
        <a class="back" href="javascript:history.back()">← Back</a>
        <article class="recipe-card">
          <div class="recipe-side">
            <span class="eyebrow eyebrow-icon">${icon(categoryIcon(r))}${esc([r.cuisine, r.mealType].filter(Boolean).join(' · ') || 'Recipe')}</span>
            <h1>${esc(r.name)}</h1>
            <div class="stats">${stat('SERVES', r.servings, 'servings')}${stat('PREP', r.prep ? r.prep + ' min' : '', 'prep-time')}${stat('COOK', r.cook ? r.cook + ' min' : '', 'cook-time')}</div>
            ${tags.length ? `<div class="tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
            <h2>${icon('ingredients', 'ico-h')}Ingredients</h2>
            ${(r.ingredientGroups || []).map((g) => `
              ${g.label ? `<p class="group-label">${esc(g.label)}</p>` : ''}
              <div class="checklist">${g.items.map((it) => `<label><input type="checkbox" id="i${n++}"><span>${rich(it)}</span></label>`).join('')}</div>`).join('')}
            ${r.source ? `<p class="source">From ${r.sourceLink ? `<a href="${esc(r.sourceLink)}" rel="noopener">${esc(r.source)}</a>` : esc(r.source)}</p>` : ''}
          </div>
          <div class="recipe-main">
            ${thumb(r, 'hero-photo')}
            <h2>${icon('steps', 'ico-h')}Instructions</h2>
            ${(r.steps || []).map((s, i) => `<div class="step"><span class="step-num">${i + 1}</span><p>${rich(s)}</p></div>`).join('')}
          </div>
          ${(r.notes || []).length || (r.related || []).length ? `<aside class="notes">
            ${(r.notes || []).length ? `<h2>${icon('notes', 'ico-h')}Notes &amp; variations</h2><ul>${r.notes.map((x) => `<li>${rich(x)}</li>`).join('')}</ul>` : ''}
            ${(r.related || []).length ? `<div class="related"><h2>Related recipes</h2><ul>${r.related.map((x) => `<li><a class="inline-link" href="#/recipe/${esc(x.slug)}">${esc(x.name)}</a></li>`).join('')}</ul></div>` : ''}
          </aside>` : ''}
          <div class="actions">
              ${(r.steps || []).length ? `<button type="button" class="btn" id="cook-btn">${icon('timer')}Start cooking mode</button>` : ''}
              <button type="button" class="btn btn-ghost" onclick="window.print()">${icon('print')}Print card</button>
            </div>
        </article>
      </section>
      <div class="cook" id="cook" hidden role="dialog" aria-modal="true" aria-label="Cooking mode"></div>`;
    const btn = document.getElementById('cook-btn');
    if (btn) btn.addEventListener('click', () => openCook(r));
    window.scrollTo(0, 0);
  }

  // ---------- cooking mode ----------
  async function openCook(r) {
    cook = { r, i: 0, lock: null };
    try { if ('wakeLock' in navigator) cook.lock = await navigator.wakeLock.request('screen'); } catch (_) { /* screen may still sleep */ }
    document.addEventListener('keydown', cookKeys);
    drawCook();
  }
  function drawCook() {
    const el = document.getElementById('cook');
    if (!el || !cook) return;
    const steps = cook.r.steps, i = cook.i, last = i === steps.length - 1;
    el.hidden = false;
    el.innerHTML = `
      <div class="cook-top">
        <div class="cook-progress" aria-hidden="true">${steps.map((_, k) => `<span class="${k <= i ? 'done' : ''}"></span>`).join('')}</div>
        <button type="button" class="btn btn-ghost" data-c="close">Close</button>
      </div>
      <div class="cook-step"><span class="eyebrow" style="color:var(--sand)">${esc(cook.r.name)} · Step ${i + 1} of ${steps.length}</span><p>${rich(steps[i])}</p></div>
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
    wireSearchBox();
    window.addEventListener('hashchange', () => { document.title = 'Our Family Table'; route(); });
    route();
  }
  boot();
})();
