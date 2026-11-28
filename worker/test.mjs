// Runs the Worker against a pretend Notion so it can be checked without any keys: `node test.mjs`
import assert from 'node:assert/strict';
import worker from './src/index.js';

const rows = new Map(); // id → page
let nextId = 1, calls = 0;
const prop = (s) => [{ plain_text: s }];
const env = { NOTION_TOKEN: 't', FAMILY_KEY: 'secret', MEAL_PLAN_DATA_SOURCE_ID: 'ds', SITE_URL: 'https://example.github.io/family-recipes', TIME_ZONE: 'America/Boise' };

globalThis.fetch = async (url, init = {}) => {
  calls++;
  const u = String(url);
  if (u.endsWith('data/recipes.json')) return Response.json({ recipes: [{ slug: 'tamales', name: 'Pork Tamales', photo: 'images/tamales.jpg', cuisine: 'Mexican' }] });
  const body = init.body ? JSON.parse(init.body) : {};
  const toPage = (id, p) => ({ id, last_edited_time: new Date().toISOString(), properties: {
    Meal: { title: prop((p.Meal.title[0] || {}).text?.content || '') },
    Date: { date: p.Date.date },
    'Recipe slug': { rich_text: p['Recipe slug'].rich_text.map((t) => ({ plain_text: t.text.content })) },
    Note: { rich_text: p.Note.rich_text.map((t) => ({ plain_text: t.text.content })) },
  } });
  if (u.endsWith('/data_sources/ds/query')) {
    const [a, b] = body.filter.and.map((f) => f.date.on_or_after || f.date.on_or_before);
    const results = [...rows.values()].filter((r) => !r.trashed && r.properties.Date.date.start >= a && r.properties.Date.date.start <= b);
    return Response.json({ results, has_more: false });
  }
  if (u.endsWith('/pages') && init.method === 'POST') { const id = 'p' + nextId++; rows.set(id, toPage(id, body.properties)); return Response.json({ id }); }
  const m = /\/pages\/(\w+)$/.exec(u);
  if (m && init.method === 'PATCH') {
    if (body.in_trash) rows.get(m[1]).trashed = true; else rows.set(m[1], toPage(m[1], body.properties));
    return Response.json({ id: m[1] });
  }
  return new Response('nope', { status: 404 });
};

const call = async (method, path, body, headers = {}) => {
  const res = await worker.fetch(new Request('https://w.example' + path, { method, body: body && JSON.stringify(body), headers: { Origin: 'https://example.github.io', ...headers } }), env);
  return { status: res.status, data: await res.json(), cors: res.headers.get('Access-Control-Allow-Origin') };
};

// Writing needs the passcode.
assert.equal((await call('POST', '/plan', { changes: { '2026-12-01': { slug: 'tamales' } } })).status, 401);
assert.equal((await call('POST', '/plan', { changes: { '2026-12-01': { slug: 'tamales' } } }, { 'X-Family-Key': 'wrong' })).status, 401);

const ok = { 'X-Family-Key': 'secret' };
let r = await call('POST', '/plan', { changes: { '2026-12-01': { slug: 'tamales' }, '2026-12-02': { note: 'Leftovers' } } }, ok);
assert.equal(r.status, 200);
assert.equal(r.cors, 'https://example.github.io');

r = await call('GET', '/plan?from=2026-11-30&to=2026-12-07');
assert.deepEqual(r.data.plan, { '2026-12-01': { slug: 'tamales' }, '2026-12-02': { note: 'Leftovers' } });
assert.equal([...rows.values()][0].properties.Meal.title[0].plain_text, 'Pork Tamales');

// Replace one night, clear another; no duplicate rows.
await call('POST', '/plan', { changes: { '2026-12-01': { note: 'Eating out' }, '2026-12-02': null } }, ok);
r = await call('GET', '/plan?from=2026-11-30&to=2026-12-07');
assert.deepEqual(r.data.plan, { '2026-12-01': { note: 'Eating out' } });
assert.equal([...rows.values()].filter((x) => !x.trashed).length, 1);

// Widget endpoint.
await call('POST', '/plan', { changes: { '2026-12-01': { slug: 'tamales' } } }, ok);
r = await call('GET', '/today?date=2026-12-01');
assert.equal(r.data.today.kind, 'recipe');
assert.equal(r.data.today.name, 'Pork Tamales');
assert.equal(r.data.today.url, 'https://example.github.io/family-recipes/#/recipe/tamales');
assert.equal(r.data.today.photo, 'https://example.github.io/family-recipes/images/tamales.jpg');
assert.equal(r.data.tomorrow.kind, 'none');

// A whole month stays under the free plan's 50 calls per request.
const month = {};
for (let d = 1; d <= 31; d++) month[`2027-01-${String(d).padStart(2, '0')}`] = { slug: 'tamales' };
calls = 0;
assert.equal((await call('POST', '/plan', { changes: month }, ok)).status, 200);
assert.ok(calls < 50, `month fill used ${calls} calls`);

assert.equal((await call('GET', '/plan?from=bad&to=2026-12-01')).status, 400);
console.log('Worker checks passed (month fill used ' + calls + ' Notion calls).');
