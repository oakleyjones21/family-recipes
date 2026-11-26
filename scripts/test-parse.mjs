// Checks the Notion → recipe parser against the block shapes the Chicken Piccata card uses.
// Run: node scripts/test-parse.mjs
import assert from 'node:assert/strict';
import { parseBody, parseProperties, slugify, rich, resolveLinks } from './sync-notion.mjs';

const rt = (s, a = {}) => [{ plain_text: s, annotations: { bold: false, italic: false, ...a } }];
const blk = (type, text, extra = {}, children) => ({ type, [type]: { rich_text: text == null ? [] : (Array.isArray(text) ? text : rt(text)), ...extra }, has_children: !!children, _children: children });
const li = (s) => blk('bulleted_list_item', s);
const ol = (s) => blk('numbered_list_item', s);

const page = [
  blk('column_list', null, {}, [
    blk('column', null, {}, [
      blk('callout', 'Photo: replace this with a picture', {}, [blk('image', null, { type: 'file', file: { url: 'https://files.example/piccata.jpg?X-Amz=1' } })]),
      blk('heading_2', 'Ingredients'),
      blk('paragraph', rt('Chicken', { italic: true })),
      li('3 large boneless, skinless chicken breasts (about 2¼ lb)'),
      li('½ cup all-purpose flour'),
      blk('paragraph', rt('Sauce', { italic: true })),
      li('⅓ cup fresh lemon juice (about 2 lemons)'),
      li('3 tbsp capers, drained'),
      blk('paragraph', 'To serve:'),
      li('1 lb angel hair or spaghetti'),
    ]),
    blk('column', null, {}, [
      blk('heading_2', 'Instructions'),
      ol('Start the pasta water.'),
      ol('Slice each breast in half horizontally.'),
      ol('Serve the chicken on top.'),
    ]),
  ]),
  blk('callout', [{ plain_text: 'Notes & Variations', annotations: { bold: true } }], {}, [
    li('Feeding 7+: use 4 breasts.'),
    li('Kids: halve the capers.'),
  ]),
  blk('toggle', 'Original', {}, [blk('image', null, { type: 'file', file: { url: 'https://files.example/scan.jpg' } }), blk('paragraph', 'scan text')]),
];

const body = parseBody(page);
assert.equal(body.photo, 'https://files.example/piccata.jpg?X-Amz=1', 'photo comes from the card, not the Original toggle');
assert.deepEqual(body.ingredientGroups.map((g) => g.label), ['Chicken', 'Sauce', 'To serve']);
assert.equal(body.ingredientGroups[0].items.length, 2);
assert.deepEqual(body.steps, ['Start the pasta water.', 'Slice each breast in half horizontally.', 'Serve the chicken on top.']);
assert.deepEqual(body.notes, ['Feeding 7+: use 4 breasts.', 'Kids: halve the capers.']);

// Ingredients with no group labels and steps as paragraphs
const plainCard = parseBody([blk('heading_3', 'Ingredients'), li('2 cups flour'), li('1 tsp salt'), blk('heading_3', 'Directions'), blk('paragraph', 'Mix.'), blk('paragraph', 'Bake.')]);
assert.deepEqual(plainCard.ingredientGroups, [{ label: null, items: ['2 cups flour', '1 tsp salt'] }]);
assert.deepEqual(plainCard.steps, ['Mix.', 'Bake.']);

const props = parseProperties({
  id: 'p1', last_edited_time: '2026-11-25T22:00:00Z',
  properties: {
    Name: { type: 'title', title: rt('Chicken Piccata') },
    'Meal Type': { type: 'select', select: { name: 'Dinner' } },
    'Key Ingredients': { type: 'multi_select', multi_select: [{ name: 'chicken' }, { name: 'lemon' }] },
    Rating: { type: 'select', select: { name: '★★★★★' } },
    Servings: { type: 'number', number: 6 },
  },
});
assert.equal(props.rating, 5);
assert.equal(props.mealType, 'Dinner');
assert.deepEqual(props.keyIngredients, ['chicken', 'lemon']);
assert.equal(slugify("Grandma's Crème Brûlée!"), 'grandma-s-creme-brulee');

// Links: Notion page links and mentions survive parsing, then resolve to site links
const link = (text, href) => ({ plain_text: text, href, annotations: { bold: false, italic: false } });
const MASA = '42489a9745128146ae31ff6d7d3c5ce8', SAUCE = '42489a974512811bb332f6b058c3320c', HIDDEN = '11111111111111111111111111111111';
assert.equal(rich([{ plain_text: 'See ', annotations: {} }, link('Masa', 'https://app.notion.com/p/' + MASA), { plain_text: ' now.', annotations: {} }]), 'See [Masa](https://app.notion.com/p/' + MASA + ') now.');
const linked = parseBody([
  blk('column_list', null, {}, [
    blk('column', null, {}, [blk('heading_2', 'Ingredients'), li([{ plain_text: '1 batch ', annotations: {} }, link('masa', 'https://app.notion.com/p/' + MASA + '?pvs=204')])]),
    blk('column', null, {}, [blk('heading_2', 'Instructions'), ol([link('Make the sauce', 'https://app.notion.com/p/' + SAUCE)])]),
  ]),
  blk('callout', [{ plain_text: 'Notes & Variations', annotations: { bold: true } }], {}, [
    li([{ plain_text: 'Sauce: ', annotations: {} }, link('Red Chile Sauce', 'https://app.notion.com/p/' + SAUCE)]),
    li([link('Private page', 'https://app.notion.com/p/' + HIDDEN), { plain_text: ' and ', annotations: {} }, link('the source', 'https://muybuenoblog.com/make-authentic-red-chile-sauce/')]),
  ]),
]);
assert.equal(linked.notes[0], 'Sauce: [Red Chile Sauce](https://app.notion.com/p/' + SAUCE + ')');
const pork = { id: '42489a97-4512-813a-a5ca-c96af5f933a2', name: 'Pork', slug: 'pork', ...linked, relatedIds: ['42489a97-4512-8146-ae31-ff6d7d3c5ce8', '42489a97-4512-811b-b332-f6b058c3320c', HIDDEN] };
const masa = { id: '42489a97-4512-8146-ae31-ff6d7d3c5ce8', name: 'Masa', slug: 'masa', ingredientGroups: [], steps: [], notes: [] };
const sauce = { id: '42489a97-4512-811b-b332-f6b058c3320c', name: 'Sauce', slug: 'sauce', ingredientGroups: [], steps: [], notes: [] };
resolveLinks([pork, masa, sauce]);
assert.equal(pork.ingredientGroups[0].items[0], '1 batch [masa](#/recipe/masa)');
assert.equal(pork.steps[0], '[Make the sauce](#/recipe/sauce)');
assert.equal(pork.notes[0], 'Sauce: [Red Chile Sauce](#/recipe/sauce)');
assert.equal(pork.notes[1], 'Private page and [the source](https://muybuenoblog.com/make-authentic-red-chile-sauce/)', 'unpublished Notion links become plain text; outside links stay');
assert.deepEqual(pork.related, [{ slug: 'masa', name: 'Masa' }, { slug: 'sauce', name: 'Sauce' }], 'relation resolves to published recipes only');
assert.equal('relatedIds' in pork, false);
assert.deepEqual(parseProperties({ id: 'p', properties: { 'Related Recipes': { type: 'relation', relation: [{ id: 'a' }, { id: 'b' }] } } }).relatedIds, ['a', 'b']);

console.log('parser tests passed');
