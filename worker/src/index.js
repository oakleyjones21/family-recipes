// Meal Plan Worker — the go-between for the recipe site, the Notion "Meal Plan" database and the iPhone widget.
//
//   GET  /plan?from=YYYY-MM-DD&to=YYYY-MM-DD  → { plan: { "2026-12-01": { slug } | { note } } }
//   POST /plan  { changes: { date: { slug } | { note } | null } }   needs the X-Family-Key header
//   GET  /today[?date=YYYY-MM-DD]             → { today: {...}, tomorrow: {...} }  (for the widget)
//
// Secrets (set with `npx wrangler secret put NAME`): NOTION_TOKEN, FAMILY_KEY.
// Plain settings live in wrangler.toml: MEAL_PLAN_DATA_SOURCE_ID, SITE_URL, TIME_ZONE.

const NOTION = 'https://api.notion.com/v1';
const NOTION_VERSION = '2025-09-03';
const MAX_CHANGES = 45; // a whole month plus room; keeps each request under the free plan's 50-call limit
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      if (url.pathname === '/plan' && request.method === 'GET') return json(await getPlan(env, url), cors);
      if (url.pathname === '/plan' && request.method === 'POST') return json(await postPlan(env, request), cors);
      if (url.pathname === '/today' && request.method === 'GET') return json(await getToday(env, url), cors, 60);
      if (url.pathname === '/' ) return json({ ok: true, service: 'our family table meal plan' }, cors);
      return json({ error: 'Not found' }, cors, 0, 404);
    } catch (e) {
      const status = e.status || 500;
      return json({ error: e.expose ? e.message : 'Something went wrong talking to Notion.' }, cors, 0, status);
    }
  },
};

// ---------- routes ----------

async function getPlan(env, url) {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) throw httpError(400, 'Pass from and to as YYYY-MM-DD.');
  const rows = await queryRange(env, from, to);
  const plan = {};
  for (const [date, list] of Object.entries(groupByDate(rows))) plan[date] = entryOf(list[0]);
  return { plan };
}

async function postPlan(env, request) {
  if (!env.FAMILY_KEY || !safeEqual(request.headers.get('X-Family-Key') || '', env.FAMILY_KEY)) {
    throw httpError(401, 'That family passcode didn’t match.');
  }
  const body = await request.json().catch(() => null);
  const changes = body && body.changes;
  if (!changes || typeof changes !== 'object') throw httpError(400, 'Send { changes: { date: entry or null } }.');
  const dates = Object.keys(changes).filter((d) => DATE_RE.test(d)).sort();
  if (!dates.length) return { saved: 0 };
  if (dates.length > MAX_CHANGES) throw httpError(400, `Save at most ${MAX_CHANGES} nights at once.`);

  const recipes = await recipeIndex(env);
  const existing = groupByDate(await queryRange(env, dates[0], dates[dates.length - 1]));

  const jobs = [];
  for (const date of dates) {
    const entry = clean(changes[date]);
    const rows = existing[date] || [];
    if (!entry) { rows.forEach((row) => jobs.push(() => trash(env, row.id))); continue; }
    const props = propsFor(env, date, entry, recipes);
    const [keep, ...extra] = rows;
    if (keep) {
      const cur = entryOf(keep);
      if (cur.slug !== entry.slug || cur.note !== entry.note) jobs.push(() => notion(env, 'PATCH', `/pages/${keep.id}`, { properties: props }));
    } else {
      jobs.push(() => notion(env, 'POST', '/pages', { parent: { type: 'data_source_id', data_source_id: env.MEAL_PLAN_DATA_SOURCE_ID }, properties: props }));
    }
    extra.forEach((row) => jobs.push(() => trash(env, row.id))); // tidy up doubles someone added by hand
  }
  await runLimited(jobs, 3);
  return { saved: dates.length };
}

async function getToday(env, url) {
  const date = DATE_RE.test(url.searchParams.get('date') || '') ? url.searchParams.get('date') : localDate(env.TIME_ZONE || 'America/Boise');
  const next = shiftDate(date, 1);
  const [rows, recipes] = await Promise.all([queryRange(env, date, next), recipeIndex(env)]);
  const byDate = groupByDate(rows);
  const describe = (d) => {
    const row = (byDate[d] || [])[0];
    if (!row) return { date: d, kind: 'none', name: null };
    const e = entryOf(row);
    if (e.note) return { date: d, kind: 'note', name: e.note };
    const r = recipes.get(e.slug);
    const site = siteBase(env);
    return {
      date: d,
      kind: 'recipe',
      slug: e.slug,
      name: (r && r.name) || titleOf(row) || e.slug,
      cuisine: (r && r.cuisine) || null,
      totalTime: (r && r.totalTime) || null,
      url: `${site}#/recipe/${encodeURIComponent(e.slug)}`,
      photo: r && r.photo ? new URL(r.photo, site).href : null,
    };
  };
  return { today: describe(date), tomorrow: describe(next), planUrl: `${siteBase(env)}#/plan` };
}

// ---------- Notion ----------

async function notion(env, method, path, body, attempt = 0) {
  const res = await fetch(NOTION + path, {
    method,
    headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 && attempt < 1) {
    const wait = Math.min(Number(res.headers.get('Retry-After')) || 1, 3) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return notion(env, method, path, body, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text();
    console.log('Notion error', res.status, path, text.slice(0, 500));
    throw httpError(502, 'Notion turned the request down. Check that the Meal Plan database is shared with the Worker’s connection.');
  }
  return res.json();
}

async function queryRange(env, from, to) {
  const rows = [];
  let cursor;
  do {
    const r = await notion(env, 'POST', `/data_sources/${env.MEAL_PLAN_DATA_SOURCE_ID}/query`, {
      page_size: 100,
      start_cursor: cursor,
      filter: { and: [{ property: 'Date', date: { on_or_after: from } }, { property: 'Date', date: { on_or_before: to } }] },
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }], // newest edit wins if a night has two rows
    });
    rows.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return rows;
}

const trash = (env, id) => notion(env, 'PATCH', `/pages/${id}`, { in_trash: true });

function groupByDate(rows) {
  const out = {};
  for (const row of rows) {
    const d = row.properties.Date && row.properties.Date.date && row.properties.Date.date.start;
    if (!d) continue;
    const key = d.slice(0, 10);
    (out[key] = out[key] || []).push(row);
  }
  return out;
}

const plain = (prop) => (prop && (prop.rich_text || prop.title) || []).map((t) => t.plain_text).join('').trim();
const titleOf = (row) => plain(row.properties.Meal);

// A row with a slug is a recipe night; otherwise its note (or, for rows typed straight into Notion, its title) is the note.
function entryOf(row) {
  const slug = plain(row.properties['Recipe slug']);
  if (slug) return { slug };
  return { note: plain(row.properties.Note) || titleOf(row) || 'Planned' };
}

function clean(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (typeof entry.slug === 'string' && entry.slug.trim()) return { slug: entry.slug.trim().slice(0, 200) };
  if (typeof entry.note === 'string' && entry.note.trim()) return { note: entry.note.trim().slice(0, 200) };
  return null;
}

function propsFor(env, date, entry, recipes) {
  const text = (s) => [{ type: 'text', text: { content: s } }];
  if (entry.slug) {
    const r = recipes.get(entry.slug);
    return {
      Meal: { title: text((r && r.name) || entry.slug) },
      Date: { date: { start: date } },
      'Recipe slug': { rich_text: text(entry.slug) },
      Note: { rich_text: [] },
      'Recipe link': { url: `${siteBase(env)}#/recipe/${encodeURIComponent(entry.slug)}` },
    };
  }
  return {
    Meal: { title: text(entry.note) },
    Date: { date: { start: date } },
    'Recipe slug': { rich_text: [] },
    Note: { rich_text: text(entry.note) },
    'Recipe link': { url: null },
  };
}

// ---------- recipes from the published site ----------

async function recipeIndex(env) {
  const map = new Map();
  try {
    const res = await fetch(`${siteBase(env)}data/recipes.json`, { cf: { cacheTtl: 600, cacheEverything: true } });
    if (res.ok) for (const r of (await res.json()).recipes || []) map.set(r.slug, r);
  } catch (_) { /* names fall back to the slug */ }
  return map;
}

// ---------- helpers ----------

const siteBase = (env) => (env.SITE_URL || '').replace(/\/?$/, '/');

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new URL(siteBase(env)).origin;
  const ok = origin === allowed || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Family-Key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, headers, maxAge = 0, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store' },
  });
}

function httpError(status, message) { const e = new Error(message); e.status = status; e.expose = true; return e; }

function safeEqual(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

function localDate(timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function shiftDate(ymd, n) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function runLimited(jobs, limit) {
  let i = 0;
  const worker = async () => { while (i < jobs.length) { const job = jobs[i++]; await job(); } };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
}
