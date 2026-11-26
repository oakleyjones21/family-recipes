/* Our Family Table — static recipe site fed by recipes.json (synced from Notion). */
(function () {
  'use strict';

  const main = document.getElementById('main');
  const state = { recipes: [], terms: [], meal: null, kid: false, quick: false };
  let cook = null; // cooking-mode state

  const LEAF = '<svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M24 42V20"/><path d="M24 30c-9 0-14-6-14-16 10 0 14 6 14 16Z"/><path d="M24 24c8 0 12-5 12-13-8 0-12 5-12 13Z"/></svg>';

  // ---------- helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

  function thumb(r, cls) {
    return r.photo
      ? `<div class="${cls}"><img src="${esc(r.photo)}" alt="${esc(r.name)}" loading="lazy"></div>`
      : `<div class="${cls}">${LEAF}</div>`;
  }

  // Does recipe r use ingredient term t? Checks tags first, then every ingredient line.
  function uses(r, t) {
    const s = singular(t);
    if ((r.keyIngredients || []).some((k) => { const n = norm(k); return n === t || n === s || n.includes(s); })) return true;
    const re = new RegExp('\\b' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    return (r.ingredientGroups || []).some((g) => g.items.some((line) => re.test(line)));
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
          ${meals.map((m) => `<button type="button" class="filter" data-meal="${esc(m)}" aria-pressed="${state.meal === m}">${esc(m)}</button>`).join('')}
          <button type="button" class="filter" data-toggle="kid" aria-pressed="${state.kid}">Kid can make</button>
          <button type="button" class="filter" data-toggle="quick" aria-pressed="${state.quick}">Under 30 min</button>
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
    const meta = [timeLabel(r), r.servings ? 'serves ' + r.servings : '', stars(r.rating)].filter(Boolean).join(' · ');
    const partial = nTerms && hits < nTerms ? `<span class="badge">uses ${hits} of ${nTerms}</span>` : '';
    const fav = !partial && r.status === 'Family Favorite' ? '<span class="badge">Family favorite</span>' : '';
    return `<a class="card" href="#/recipe/${esc(r.slug)}">
      ${thumb(r, 'thumb')}
      <div class="card-body">${partial || fav}<div class="card-title">${opts.title || esc(r.name)}</div><div class="card-meta">${esc(meta)}</div>${opts.snippet ? `<div class="snippet">${opts.snippet}</div>` : ''}</div>
    </a>`;
  }

  // ---------- full-text search ----------
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordRe = (t) => new RegExp('\\b' + reEsc(singular(t)), 'i');

  function fieldsOf(r) {
    const f = [{ label: 'Name', text: r.name, w: 10 }];
    const tags = [r.cuisine, r.mealType, ...(r.occasion || []), ...(r.keyIngredients || []), ...(r.method || [])].filter(Boolean);
    if (tags.length) f.push({ label: 'Tags', text: tags.join(' · '), w: 5 });
    (r.ingredientGroups || []).forEach((g) => g.items.forEach((it) => f.push({ label: 'Ingredient', text: it, w: 3 })));
    (r.notes || []).forEach((n) => f.push({ label: 'Note', text: n, w: 2 }));
    (r.steps || []).forEach((s, i) => f.push({ label: 'Step ' + (i + 1), text: s, w: 1 }));
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
    const stat = (label, val) => val ? `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${esc(val)}</div></div>` : '';
    let n = 0;
    main.innerHTML = `
      <section class="wrap recipe">
        <a class="back" href="javascript:history.back()">← Back</a>
        <article class="recipe-card">
          <div class="recipe-side">
            <span class="eyebrow">${esc([r.cuisine, r.mealType].filter(Boolean).join(' · ') || 'Recipe')}</span>
            <h1>${esc(r.name)}</h1>
            <div class="stats">${stat('SERVES', r.servings)}${stat('PREP', r.prep ? r.prep + ' min' : '')}${stat('COOK', r.cook ? r.cook + ' min' : '')}</div>
            ${tags.length ? `<div class="tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
            <h2>Ingredients</h2>
            ${(r.ingredientGroups || []).map((g) => `
              ${g.label ? `<p class="group-label">${esc(g.label)}</p>` : ''}
              <div class="checklist">${g.items.map((it) => `<label><input type="checkbox" id="i${n++}"><span>${esc(it)}</span></label>`).join('')}</div>`).join('')}
            ${r.source ? `<p class="source">From ${r.sourceLink ? `<a href="${esc(r.sourceLink)}" rel="noopener">${esc(r.source)}</a>` : esc(r.source)}</p>` : ''}
          </div>
          <div class="recipe-main">
            ${thumb(r, 'hero-photo')}
            <h2>Instructions</h2>
            ${(r.steps || []).map((s, i) => `<div class="step"><span class="step-num">${i + 1}</span><p>${esc(s)}</p></div>`).join('')}
            <div class="actions">
              ${(r.steps || []).length ? '<button type="button" class="btn" id="cook-btn">Start cooking mode</button>' : ''}
              <button type="button" class="btn btn-ghost" onclick="window.print()">Print card</button>
            </div>
          </div>
          ${(r.notes || []).length ? `<aside class="notes"><h2>Notes &amp; variations</h2><ul>${r.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></aside>` : ''}
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
      <div class="cook-step"><span class="eyebrow" style="color:var(--sand)">${esc(cook.r.name)} · Step ${i + 1} of ${steps.length}</span><p>${esc(steps[i])}</p></div>
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
