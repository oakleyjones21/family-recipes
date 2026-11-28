// "Tonight" widget for our family table — runs in the free Scriptable app on iPhone.
// Shows tonight's planned dinner (and tomorrow's on the medium size). Tap it to open the recipe.
//
// Setup: paste this whole file into a new Scriptable script, put your Worker address below, then add a
// Scriptable widget to the home screen or lock screen and pick this script. Full steps: worker/README.md.

const WORKER_URL = 'https://family-table-plan.YOUR-SUBDOMAIN.workers.dev';

const C = {
  ground: new Color('#F7F3EC'),
  ink: new Color('#3E3C32'),
  olive: new Color('#5C5A45'),
  brown: new Color('#8A5E45'),
  sand: new Color('#D8CABB'),
  onDark: new Color('#F7F3EC'),
};
const serif = (size) => new Font('Georgia', size);
const sans = (size, bold) => (bold ? Font.semiboldSystemFont(size) : Font.systemFont(size));

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), 'family-table-tonight.json');

async function load() {
  const today = new Date();
  const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  try {
    const req = new Request(`${WORKER_URL.replace(/\/+$/, '')}/today?date=${ymd}`);
    req.timeoutInterval = 10;
    const data = await req.loadJSON();
    if (!data || !data.today) throw new Error('bad reply');
    fm.writeString(cachePath, JSON.stringify(data));
    return data;
  } catch (e) {
    // No signal: show the last answer if it was for today.
    if (fm.fileExists(cachePath)) {
      const old = JSON.parse(fm.readString(cachePath));
      if (old.today && old.today.date === ymd) return old;
    }
    return null;
  }
}

async function photo(url) {
  if (!url) return null;
  try { const r = new Request(url); r.timeoutInterval = 10; return await r.loadImage(); } catch (_) { return null; }
}

const label = (d) => (d.kind === 'none' ? 'Nothing planned yet' : d.name);

function eyebrow(stack, text, color) {
  const t = stack.addText(text.toUpperCase());
  t.font = sans(10, true);
  t.textColor = color;
}

async function build(data) {
  const family = config.widgetFamily || 'medium';
  const w = new ListWidget();
  w.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000); // iOS decides the real timing; this asks for about hourly

  if (!data) {
    if (family.startsWith('accessory')) { w.addText('Dinner plan unavailable').font = sans(12); return w; }
    w.backgroundColor = C.ground;
    eyebrow(w, 'Tonight', C.olive);
    w.addSpacer(4);
    const t = w.addText('Can’t reach the meal plan right now.');
    t.font = sans(13); t.textColor = C.ink;
    return w;
  }

  const tonight = data.today;
  w.url = tonight.url || data.planUrl;

  // Lock screen sizes: plain text that iOS tints for you.
  if (family === 'accessoryInline') { w.addText(`🍽 ${label(tonight)}`); return w; }
  if (family === 'accessoryRectangular' || family === 'accessoryCircular') {
    const e = w.addText('TONIGHT'); e.font = sans(10, true); e.textOpacity = 0.7;
    const t = w.addText(label(tonight)); t.font = sans(14, true); t.lineLimit = 2; t.minimumScaleFactor = 0.7;
    return w;
  }

  const img = await photo(tonight.photo);
  w.setPadding(14, 14, 14, 14);

  if (family === 'small') {
    if (img) {
      w.backgroundImage = img;
      const g = new LinearGradient();
      g.colors = [new Color('#3E3C32', 0.05), new Color('#3E3C32', 0.85)];
      g.locations = [0.25, 1];
      w.backgroundGradient = g;
    } else {
      w.backgroundColor = C.ground;
    }
    const fg = img ? C.onDark : C.ink;
    w.addSpacer();
    eyebrow(w, 'Tonight', img ? C.sand : C.olive);
    w.addSpacer(2);
    const t = w.addText(label(tonight));
    t.font = serif(tonight.kind === 'recipe' ? 20 : 17); t.textColor = fg; t.lineLimit = 3; t.minimumScaleFactor = 0.6;
    if (tonight.totalTime) { const m = w.addText(tonight.totalTime); m.font = sans(11); m.textColor = img ? C.sand : C.olive; }
    return w;
  }

  // Medium and large: photo on the left, tonight and tomorrow on the right.
  w.backgroundColor = C.ground;
  const row = w.addStack();
  row.centerAlignContent();
  if (img) {
    const pic = row.addImage(img);
    pic.imageSize = new Size(110, 110);
    pic.cornerRadius = 18;
    pic.applyFillingContentMode();
    row.addSpacer(14);
  }
  const col = row.addStack();
  col.layoutVertically();
  eyebrow(col, 'Tonight', C.olive);
  col.addSpacer(2);
  const t = col.addText(label(tonight));
  t.font = serif(22); t.textColor = C.ink; t.lineLimit = 2; t.minimumScaleFactor = 0.6;
  const meta = [tonight.cuisine, tonight.totalTime].filter(Boolean).join(' · ');
  if (meta) { const m = col.addText(meta); m.font = sans(11); m.textColor = C.olive; }
  col.addSpacer(8);
  eyebrow(col, 'Tomorrow', C.brown);
  const tm = col.addText(label(data.tomorrow));
  tm.font = sans(13); tm.textColor = C.ink; tm.lineLimit = 1;
  row.addSpacer();
  return w;
}

const data = await load();
const widget = await build(data);
if (config.runsInWidget || config.runsInAccessoryWidget) Script.setWidget(widget);
else await widget.presentMedium(); // running inside Scriptable shows a preview
Script.complete();
