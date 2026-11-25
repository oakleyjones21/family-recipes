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
    default: return null;
  }
}

export function parseProperties(page) {
  const P = page.properties || {};
  const rating = prop(P['Rating']);
  return {
    id: page.id,
    name: prop(P['Name']) || 'Untitled recipe',
    mealType: prop(P['Meal Type']),
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
    lastEdited: page.last_edited_time,
  };
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
          kids.forEach((k) => { const s = plain(k[k.type]?.rich_text); if (s) notes.push(s); });
          // a callout whose notes are written inline after the title line
          const rest = text.replace(/^[^\n]*(notes?|variations?|tips?)[^\n]*\n?/i, '').trim();
          if (rest) rest.split('\n').map((s) => s.replace(/^[-•]\s*/, '').trim()).filter(Boolean).forEach((s) => notes.push(s));
        } else if (b._children) walk(b._children, ctx); // e.g. the photo callout holding an image
        continue;
      }

      if (t === 'column_list' || t === 'column' || t === 'synced_block') { if (b._children) walk(b._children, ctx); continue; }

      if (section === 'ingredients') {
        if (t === 'paragraph' && text) {
          if (allItalic(data.rich_text) || /:$/.test(text)) groups.push({ label: text.replace(/:$/, ''), items: [] });
          else group().items.push(text);
        } else if ((t === 'bulleted_list_item' || t === 'numbered_list_item' || t === 'to_do') && text) {
          group().items.push(text);
        }
      } else if (section === 'instructions') {
        if ((t === 'numbered_list_item' || t === 'bulleted_list_item' || t === 'paragraph') && text) steps.push(text);
      } else if (section === 'notes') {
        if (text) notes.push(text);
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

  recipes.sort((a, b) => a.name.localeCompare(b.name));
  await writeFile(path.join(SITE, 'data', 'recipes.json'), JSON.stringify({ updated: new Date().toISOString(), recipes }, null, 2));
  console.log(`Synced ${recipes.length} recipes (of ${pages.length} in Notion).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
