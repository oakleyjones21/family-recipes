# Our Family Table

A read-only recipe website that mirrors the **Recipes** database in Notion. Edit recipes in Notion. The site picks up changes within the hour.

- `site/` is the website: plain HTML, CSS and JavaScript with no build step.
- `scripts/sync-notion.mjs` pulls the Notion database into `site/data/recipes.json` and downloads each recipe's photo into `site/images/`.
- `.github/workflows/sync-and-deploy.yml` runs the sync every hour, when you push, or when you press **Run workflow**. It then publishes the site to GitHub Pages.

## One-time setup (about 15 minutes)

### 1. Create a Notion connection key

1. Go to <https://www.notion.so/profile/integrations> and click **New integration**.
2. Name it *Recipe Site*, pick your workspace, and set the type to **Internal**.
3. Under **Capabilities**, turn on **Read content** only. Leave update, insert and comments off.
4. Save, then copy the **Internal Integration Secret**. You'll paste it into GitHub in step 2.
5. In Notion, open the **Family Recipe Book** page. Click **••• → Connections → Recipe Site** so the key can read it.

### 2. Put the site on GitHub

1. Create a new repository and push this folder to it.
2. Open **Settings → Secrets and variables → Actions → New repository secret**. Set the name to `NOTION_TOKEN` and the value to the secret from step 1.
3. Open **Settings → Pages** and set **Source** to **GitHub Actions**.
4. Open the **Actions** tab, choose **Sync recipes from Notion and deploy**, and click **Run workflow**.

When it finishes, the site is live at `https://<your-username>.github.io/<repo-name>/`.

## What gets published

| Notion Status   | On the site?                 |
| --------------- | ---------------------------- |
| Inbox           | No (stubs aren't ready yet)  |
| To Try          | Yes                          |
| Tested          | Yes                          |
| Family Favorite | Yes, with a badge            |
| Retired         | No                           |

To change this, add a repository **variable** named `SITE_STATUSES`, for example `Tested,Family Favorite`, and pass it to the sync step in the workflow.

The sync reads each recipe page by its headings. A page needs an **Ingredients** heading followed by list items; an italic line or a line ending in `:` starts a group, such as *Sauce*. It also needs an **Instructions** heading followed by a numbered list. A gray callout titled **Notes & Variations** becomes the notes box. The first photo on the page, or its cover image, becomes the recipe photo. Anything inside the **Original** toggle stays private to Notion.

## Meal plan

The **Meal plan** and **Surprise me** pages work right away, but each phone or computer keeps its own plan in the browser. To share one plan with the family, it's saved in the **Meal Plan** database in Notion (inside Family Recipe Book). A small free Cloudflare Worker, `worker/meal-plan-worker.js`, sits between the site and Notion. It holds the Notion key, which can't go in this public repo, and checks a family passcode.

### Turn on the shared plan (about 20 minutes, once)

1. **Make a second Notion key that can write.** At <https://www.notion.so/profile/integrations> click **New integration**, name it *Meal Planner*, type **Internal**. Under **Capabilities** turn on **Read content**, **Update content** and **Insert content**. Save and copy the secret. In Notion, open **Family Recipe Book** and click **••• → Connections → Meal Planner**. It needs the whole page so it can link nights to recipes.
2. **Create the Worker.** Sign up free at <https://dash.cloudflare.com>. Open **Workers & Pages → Create → Create Worker**, name it `meal-plan`, and click **Deploy**. Then click **Edit code**, delete what's there, paste all of `worker/meal-plan-worker.js`, and click **Deploy**.
3. **Give the Worker its secrets.** In the Worker, open **Settings → Variables and Secrets → Add**:
   - `NOTION_TOKEN`, type **Secret**: the Meal Planner secret from step 1.
   - `FAMILY_CODE`, type **Secret**: a passcode the family will type once per device. Pick something not easy to guess.
4. **Point the site at it.** Copy the Worker's address, which looks like `https://meal-plan.<you>.workers.dev`. Put it in `site/plan-config.js` as `window.OFT_PLAN_API = 'https://meal-plan.<you>.workers.dev';` and commit. The site redeploys in a minute or two.

Each device asks for the passcode the first time someone opens **Meal plan**. A device that already has nights saved in its browser offers a button to copy them into the shared plan.

### How it stays up to date

- The plan is read from Notion when the page opens, when you come back to the tab, and every minute while it's open. Changes save to Notion right away.
- You can also edit the **Meal Plan** database in Notion (the **Calendar** view is handy). Use the **Recipe** column for a recipe, or **Note** for Leftovers or Eating out. The site picks it up on its next check.
- Grocery list check marks stay on each device.
- Only recipes that are on the site (Status To Try, Tested or Family Favorite) can be picked from the site.

## Good to know

- **It's public.** Anyone with the link can see a GitHub Pages site, so keep private notes out of recipe pages.
- **Sync now:** **Actions → Run workflow**, which also works from the GitHub phone app.
- **Hourly sync pauses after 60 days without commits.** GitHub turns off scheduled runs on quiet repositories. Push any small change or click **Enable workflow** to restart it.
- **Preview locally:** `cd site && python3 -m http.server`, then open <http://localhost:8000>.
