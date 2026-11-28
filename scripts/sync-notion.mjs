#!/usr/bin/env node
// Pulls the Notion "Recipes" database into site/data/recipes.json (+ photos into site/images/).
// Notion stays the master copy; this site is a read-only mirror.
//
// Env:
//   NOTION_TOKEN            Internal integration secret (required)
//   NOTION_DATA_SOURCE_ID   Recipes data source id (defaults to the Family Recipe Book one)
//   SITE_STATUSES           Comma list of Status values to publish (default: To Try,Tested,Family Favorite)

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const API = 'https://api.notion.com/v1';
const VERSION = '2025-09-03';
const DEFAULT_DS = '42389a97-4512-8116-abd4-000bf06bf92c';

// ---------- Notion API ----------
async function notion(token, method, url, body, attempt = 0) {
  const res = await fetch(API + url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 && attempt < 5) {
    const wait = Number(res.headers.get('retry-after') || 1) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return notion(token, method, url, body, attempt + 1);
  }
  if (!res.ok) throw new Error(`Notion ${method} ${url} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function queryAll(token, dsId) {
  const pages = [];
  let cursor;
  do {
    const r = await notion(token, 'POST', `/data_sources/${dsId}/query`, { page_size: 100, start_cursor: cursor });
    pages.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return pages;
}

// Returns the block tree with children attached as `_children`.
async function blockTree(token, id) {
  const out = [];
  let cursor;
  do {
    const r = await notion(token, 'GET', `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`);
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  for (const b of out) if (b.has_children) b._children = await blockTree(token, b.id);
  return out;
}

// ---------- parsing (pure; tested in scripts/test-parse.mjs) ----------
const plain = (rt) => (rt || []).map((t) => t.plain_text).join('').trim();
// Rich text with links kept as [text](url) so the site can render them. Mentions of pages carry an href too.
export function rich(rt) {
  return (rt || []).map((t) => {
    const text = t.plain_text ?? '';
    if (!t.href || !text.trim()) return text;
    const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
    const label = text.trim().replace(/\[/g, '(').replace(/\]/g, ')');
    return `${lead}[${label}](${t.href})${trail}`;
  }).join('').trim();
}
const allItalic = (rt) => (rt || []).length > 0 && rt.every((t) => !t.plain_text.trim() || t.annotations?.italic);

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'recipe';
}

function prop(p) {
  if (!p) return null;
  switch (p.type) {
    case 'title': return plain(p.title);
    case 'rich_text': return plain(p.rich_text);
    case 'select': return p.select?.name ?? null;
    case 'multi_select': return p.multi_select.map((o) => o.name);
    case 'number': return p.number;
    case 'url': return p.url;
    case 'checkbox': return p.checkbox;
    case 'date': return p.date?.start ?? null;
    case 'relation': return (p.relation || []).map((r) => r.id);
    default: return null;
  }
}

// Meal Type can be a single select or a multi-select; the site always gets a list.
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

export function parseProperties(page) {
  const P = page.properties || {};
  const rating = prop(P['Rating']);
  return {
    id: page.id,
    name: prop(P['Name']) || 'Untitled recipe',
    mealTypes: asList(prop(P['Meal Type'])),
    mealType: asList(prop(P['Meal Type']))[0] || null, // primary (first) meal type, kept for older readers
    cuisine: prop(P['Cuisine']),
    occasion: prop(P['Occasion']) || [],
    totalTime: prop(P['Total Time']),
    prep: prop(P['Prep (min)']),
    cook: prop(P['Cook (min)']),
    servings: prop(P['Servings']),
    keyIngredients: prop(P['Key Ingredients']) || [],
    method: prop(P['Method']) || [],
    status: prop(P['Status']),
    rating: rating ? (rating.match(/★/g) || []).length : 0,
    source: prop(P['Source']),
    sourceLink: prop(P['Source Link']),
    // Related Recipes has a two-way twin (Related From), so a link added on either recipe shows on both.
    relatedIds: [...new Set([...(prop(P['Related Recipes']) || []), ...(prop(P['Related From']) || [])])],
    lastEdited: page.last_edited_time,
  };
}

const NOTION_HOST = /(^|\.)notion\.(so|com|site)$/i;
const MD_LINK = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;

// Turns links to other recipe pages into site links (#/recipe/slug). Notion links to anything we don't
// publish become plain text; other links stay as they are. Also resolves the Related Recipes relation.
export function resolveLinks(recipes) {
  const bySlug = new Map(), byId = new Map();
  for (const r of recipes) byId.set(String(r.id).replace(/-/g, '').toLowerCase(), r);
  for (const r of recipes) bySlug.set(r.slug, r);
  const fix = (str) => typeof str !== 'string' ? str : str.replace(MD_LINK, (all, label, url) => {
    let host = '';
    try { host = new URL(url).hostname; } catch { return label; }
    if (!NOTION_HOST.test(host)) return all;
    const id = (url.match(/[0-9a-f]{32}/i) || [])[0] || (url.replace(/-/g, '').match(/[0-9a-f]{32}/i) || [])[0];
    const hit = id && byId.get(id.toLowerCase());
    return hit ? `[${label}](#/recipe/${hit.slug})` : label;
  });
  for (const r of recipes) {
    r.ingredientGroups = (r.ingredientGroups || []).map((g) => ({ ...g, items: g.items.map(fix) }));
    r.steps = (r.steps || []).map(fix);
    r.notes = (r.notes || []).map(fix);
    r.related = (r.relatedIds || []).map((id) => byId.get(String(id).replace(/-/g, '').toLowerCase()))
      .filter((x) => x && x !== r).map((x) => ({ slug: x.slug, name: x.name }));
    delete r.relatedIds;
  }
  return recipes;
}

const fileUrl = (img) => img?.type === 'external' ? img.external?.url : img?.file?.url;

// Walks the page body in reading order (columns flattened) and pulls out the card sections.
export function parseBody(blocks) {
  const groups = [];
  const steps = [];
  const notes = [];
  let photo = null;
  let section = null; // 'ingredients' | 'instructions' | 'notes' | null
  const group = () => { if (!groups.length) groups.push({ label: null, items: [] }); return groups[groups.length - 1]; };

  function walk(list, ctx) {
    for (const b of list) {
      const t = b.type;
      const data = b[t] || {};
      const text = plain(data.rich_text);

      if (t === 'toggle' && /^original\b/i.test(text)) continue; // scans of the original card stay in Notion
      if (t === 'image') { if (!photo) photo = fileUrl(data); continue; }

      if (/^heading_[1-4]$/.test(t)) {
        section = /ingredient/i.test(text) ? 'ingredients'
          : /instruction|direction|method|steps|preparation/i.test(text) ? 'instructions'
          : /note|variation|tip/i.test(text) ? 'notes' : null;
        if (b._children) walk(b._children, ctx);
        continue;
      }

      if (t === 'callout') {
        if (/note|variation|tip/i.test(text)) {
          const kids = b._children || [];
          kids.forEach((k) => { const s = rich(k[k.type]?.rich_text); if (s) notes.push(s); });
          // a callout whose notes are written inline after the title line
          const rest = rich(data.rich_text).replace(/^[^\n]*(notes?|variations?|tips?)[^\n]*\n?/i, '').trim();
          if (rest) rest.split('\n').map((s) => s.replace(/^[-•]\s*/, '').trim()).filter(Boolean).forEach((s) => notes.push(s));
        } else if (b._children) walk(b._children, ctx); // e.g. the photo callout holding an image
        continue;
      }

      if (t === 'column_list' || t === 'column' || t === 'synced_block') { if (b._children) walk(b._children, ctx); continue; }

      if (section === 'ingredients') {
        if (t === 'paragraph' && text) {
          if (allItalic(data.rich_text) || /:$/.test(text)) groups.push({ label: text.replace(/:$/, ''), items: [] });
          else group().items.push(rich(data.rich_text));
        } else if ((t === 'bulleted_list_item' || t === 'numbered_list_item' || t === 'to_do') && text) {
          group().items.push(rich(data.rich_text));
        }
      } else if (section === 'instructions') {
        if ((t === 'numbered_list_item' || t === 'bulleted_list_item' || t === 'paragraph') && text) steps.push(rich(data.rich_text));
      } else if (section === 'notes') {
        if (text) notes.push(rich(data.rich_text));
      }
      if (b._children && t !== 'toggle') walk(b._children, ctx);
    }
  }
  walk(blocks, {});
  return { ingredientGroups: groups.filter((g) => g.items.length), steps, notes, photo };
}

// ---------- main ----------
async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image ${res.status}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

function extFrom(url) {
  const m = /\.(jpe?g|png|webp|gif|avif)(?:\?|$)/i.exec(url || '');
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

async function main() {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.warn('NOTION_TOKEN is not set: publishing the recipes already in site/data/recipes.json.');
    return;
  }
  const dsId = process.env.NOTION_DATA_SOURCE_ID || DEFAULT_DS;
  const publish = (process.env.SITE_STATUSES || 'To Try,Tested,Family Favorite').split(',').map((s) => s.trim());

  const pages = (await queryAll(token, dsId)).filter((p) => !p.in_trash && !p.archived);
  const imgDir = path.join(SITE, 'images');
  await rm(imgDir, { recursive: true, force: true });
  await mkdir(imgDir, { recursive: true });
  await mkdir(path.join(SITE, 'data'), { recursive: true });

  const used = new Set();
  const recipes = [];
  for (const page of pages) {
    const meta = parseProperties(page);
    if (!publish.includes(meta.status)) continue;
    let slug = slugify(meta.name);
    for (let n = 2; used.has(slug); n++) slug = `${slugify(meta.name)}-${n}`;
    used.add(slug);

    const body = parseBody(await blockTree(token, page.id));
    const photoUrl = body.photo || fileUrl(page.cover);
    let photo = null;
    if (photoUrl) {
      const file = `${slug}.${extFrom(photoUrl)}`;
      try { await download(photoUrl, path.join(imgDir, file)); photo = `images/${file}`; }
      catch (e) { console.warn(`  ! photo for "${meta.name}" skipped: ${e.message}`); }
    }
    delete body.photo;
    recipes.push({ ...meta, slug, photo, ...body });
    console.log(`  ✓ ${meta.name}`);
  }

  resolveLinks(recipes);
  recipes.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(path.join(SITE, 'data', 'recipes.json'), JSON.stringify({ updated: new Date().toISOString(), recipes }, null, 2));
  console.log(`Synced ${recipes.length} recipes (of ${pages.length} in Notion).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
