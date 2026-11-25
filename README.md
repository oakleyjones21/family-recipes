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

## Good to know

- **It's public.** Anyone with the link can see a GitHub Pages site, so keep private notes out of recipe pages.
- **Sync now:** **Actions → Run workflow**, which also works from the GitHub phone app.
- **Hourly sync pauses after 60 days without commits.** GitHub turns off scheduled runs on quiet repositories. Push any small change or click **Enable workflow** to restart it.
- **Preview locally:** `cd site && python3 -m http.server`, then open <http://localhost:8000>.
