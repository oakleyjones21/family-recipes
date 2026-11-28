// Our Family Table: meal plan go-between (Cloudflare Worker).
// The website can't hold a Notion key, because the site is public. This worker holds it,
// checks the family passcode, and reads and writes the Notion "Meal Plan" database.
//
// Settings (Cloudflare dashboard → your worker → Settings → Variables and Secrets):
//   NOTION_TOKEN          secret  Key of the "Meal Planner" Notion connection (read, update, insert)
//   FAMILY_CODE           secret  The passcode family members type once per device
//   MEAL_PLAN_DS          text    Meal Plan data source id (default below)
//   ALLOWED_ORIGINS       text    Comma list of sites allowed to call this (default below)
//
// Routes (all need the header X-Family-Code):
//   GET  /plan?from=YYYY-MM-DD&to=YYYY-MM-DD   → { plan: { "2026-12-01": { recipeId, note } } }
//   PUT  /plan   { nights: { "2026-12-01": { recipeId, recipeName } | { note } | null } }   (up to 20 nights)

const NOTION = 'https://api.notion.com/v1';
const VERSION = '2025-09-03';
const DEFAULT_DS = '42689a97-4512-815a-be91-000b3599a4cc';
const DEFAULT_ORIGINS = 'https://oakleyjones21.github.io,http://localhost:8000';
const NOTES = ['Leftovers', 'Eating out'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NIGHTS = 20;   // Cloudflare's free plan allows 50 outgoing calls per request
const MAX_RANGE_DAYS = 120;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map((s) => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Family-Code',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (origin && !allowed.includes(origin)) return reply(403, { error: 'This site isn\'t allowed to use the meal plan.' });
    if (!env.NOTION_TOKEN || !env.FAMILY_CODE) return reply(500, { error: 'The go-between is missing NOTION_TOKEN or FAMILY_CODE.' });
    if (!sameText(request.headers.get('X-Family-Code') || '', env.FAMILY_CODE)) return reply(401, { error: 'Wrong family passcode.' });

    const url = new URL(request.url);
    if (url.pathname.replace(/\/+$/, '') !== '/plan') return reply(404, { error: 'Not found.' });
    const ds = env.MEAL_PLAN_DS || DEFAULT_DS;

    try {
      if (request.method === 'GET') {
        const from = url.searchParams.get('from'), to = url.searchParams.get('to');
        if (!DAY.test(from || '') || !DAY.test(to || '') || from > to) return reply(400, { error: 'Give from and to as YYYY-MM-DD.' });
        if (daysBetween(from, to) > MAX_RANGE_DAYS) return reply(400, { error: `Ask for at most ${MAX_RANGE_DAYS} days at a time.` });
        const rows = await queryRange(env.NOTION_TOKEN, ds, from, to);
        const plan = {};
        for (const row of rows) {
          const e = rowEntry(row);
          if (e && !plan[e.date]) plan[e.date] = e.entry;   // oldest row wins if a night has two
        }
        return reply(200, { plan });
      }

      if (request.method === 'PUT') {
        let body;
        try { body = await request.json(); } catch (_) { return reply(400, { error: 'Send JSON.' }); }
        const nights = body && body.nights;
        if (!nights || typeof nights !== 'object') return reply(400, { error: 'Send { nights: { date: entry } }.' });
        const dates = Object.keys(nights).sort();
        if (!dates.length) return reply(200, { saved: 0 });
        if (dates.length > MAX_NIGHTS) return reply(400, { error: `Send at most ${MAX_NIGHTS} nights at a time.` });
        for (const d of dates) {
          if (!DAY.test(d)) return reply(400, { error: `Bad date ${d}.` });
          const e = nights[d];
          if (e !== null && !(e && (isId(e.recipeId) || NOTES.includes(e.note)))) return reply(400, { error: `Bad entry for ${d}.` });
        }
        // One query for the whole span, then one write per night.
        const rows = await queryRange(env.NOTION_TOKEN, ds, dates[0], dates[dates.length - 1]);
        const byDate = {};
        for (const row of rows) { const e = rowEntry(row); if (e) (byDate[e.date] = byDate[e.date] || []).push(row); }
        let saved = 0;
        for (const d of dates) {
          const existing = byDate[d] || [];
          const e = nights[d];
          if (e === null) {
            for (const row of existing) await notion(env.NOTION_TOKEN, 'PATCH', `/pages/${row.id}`, { in_trash: true });
          } else {
            const props = properties(d, e);
            if (existing.length) {
              await notion(env.NOTION_TOKEN, 'PATCH', `/pages/${existing[0].id}`, { properties: props });
              for (const extra of existing.slice(1)) await notion(env.NOTION_TOKEN, 'PATCH', `/pages/${extra.id}`, { in_trash: true });
            } else {
              await notion(env.NOTION_TOKEN, 'POST', '/pages', { parent: { type: 'data_source_id', data_source_id: ds }, properties: props });
            }
          }
          saved++;
        }
        return reply(200, { saved });
      }

      return reply(405, { error: 'Use GET or PUT.' });
    } catch (err) {
      return reply(502, { error: 'Notion didn\'t answer: ' + String(err.message || err).slice(0, 300) });
    }
  },
};

// ---------- helpers ----------
function sameText(a, b) {
  // Constant-time compare so the passcode can't be guessed by timing.
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
const isId = (s) => typeof s === 'string' && /^[0-9a-f]{32}$/i.test(s.replace(/-/g, ''));
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

function niceDate(d) {
  const dt = new Date(d + 'T12:00:00Z');
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function properties(date, e) {
  const label = e.recipeId ? String(e.recipeName || 'Recipe').slice(0, 120) : e.note;
  return {
    Name: { title: [{ text: { content: `${niceDate(date)} · ${label}` } }] },
    Date: { date: { start: date } },
    Recipe: { relation: e.recipeId ? [{ id: e.recipeId }] : [] },
    Note: { select: e.recipeId ? null : { name: e.note } },
    Meal: { select: { name: 'Dinner' } },
  };
}

function rowEntry(row) {
  const p = row.properties || {};
  const date = p.Date && p.Date.date && p.Date.date.start ? p.Date.date.start.slice(0, 10) : null;
  if (!date) return null;
  const rel = p.Recipe && p.Recipe.relation && p.Recipe.relation[0];
  const note = p.Note && p.Note.select ? p.Note.select.name : null;
  if (rel) return { date, entry: { recipeId: rel.id.replace(/-/g, '') } };
  if (note) return { date, entry: { note } };
  return null;   // a blank row someone added in Notion
}

async function queryRange(token, ds, from, to) {
  const rows = [];
  let cursor;
  do {
    const r = await notion(token, 'POST', `/data_sources/${ds}/query`, {
      page_size: 100,
      start_cursor: cursor,
      filter: { and: [{ property: 'Date', date: { on_or_after: from } }, { property: 'Date', date: { on_or_before: to } }] },
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
    });
    rows.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return rows;
}

async function notion(token, method, path, body, attempt = 0) {
  const res = await fetch(NOTION + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 && attempt < 3) {
    await new Promise((r) => setTimeout(r, Number(res.headers.get('retry-after') || 1) * 1000));
    return notion(token, method, path, body, attempt + 1);
  }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
