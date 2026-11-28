# Shared meal plan and the "Tonight" widget

The meal plan lives in the **Meal Plan** database in Notion (Family Recipe Book → Meal Plan). A small Cloudflare Worker sits between it and everything else:

- The **recipe site** reads the plan from the Worker and saves changes through it, so every phone sees the same plan.
- The **iPhone widget** asks the Worker what's for dinner tonight.
- Anyone can **edit in Notion** too. One row per night: put a recipe's slug in *Recipe slug*, or type something like "Leftovers" as the title.

Everything here runs on free plans. Until step 3 is done, the site keeps working the old way, with each device saving its own plan.

## One-time setup (about 20 minutes, on a computer)

### 1. Make a Notion connection that can write to the Meal Plan

1. Go to <https://www.notion.so/profile/integrations> and click **New integration**.
2. Name it *Meal Plan Worker*, pick your workspace and set the type to **Internal**.
3. Under **Capabilities**, turn on **Read content**, **Update content** and **Insert content**.
4. Save, then copy the **Internal Integration Secret**. You'll paste it in step 2.
5. In Notion, open the **Meal Plan** database itself (not the Family Recipe Book page). Click **••• → Connections → Meal Plan Worker**. That keeps this key able to change only the meal plan, not your recipes.

### 2. Put the Worker on Cloudflare

1. Make a free account at <https://dash.cloudflare.com/sign-up>.
2. In a terminal, from this `worker` folder:

   ```sh
   npm install
   npx wrangler login              # opens the browser so you can approve it
   npx wrangler deploy             # the first time, it asks you to pick a workers.dev name
   npx wrangler secret put NOTION_TOKEN   # paste the secret from step 1
   npx wrangler secret put FAMILY_KEY     # make up a family passcode
   ```

3. `wrangler deploy` prints the address, like `https://family-table-plan.yourname.workers.dev`. Open `that-address/today` in a browser. If you see `"kind":"none"` (or tonight's dinner), it's working.

The family passcode is what the site asks for the first time someone changes the plan on a new phone. Anyone with the site link can see the plan; only people with the passcode can change it. To change the passcode, run `npx wrangler secret put FAMILY_KEY` again.

### 3. Point the site at the Worker

In `site/index.html`, put the address in the `plan-api` line and push:

```html
<meta name="plan-api" content="https://family-table-plan.yourname.workers.dev">
```

The first time each phone opens the site after this, any nights it had planned on its own (today onward) are added to the shared plan, after it asks for the passcode. Grocery checkmarks still stay on each device.

### 4. Add the widget (each iPhone)

1. Install **Scriptable** from the App Store (free).
2. In Scriptable, tap **+**, paste everything from [`widget/tonight.js`](../widget/tonight.js), and replace `YOUR-SUBDOMAIN` in the `WORKER_URL` line with your Worker address. Name the script *Tonight* and tap **Done**. Tap the script once to see a preview.
3. Long-press the home screen → **Edit** → **Add Widget** → **Scriptable**. Small shows tonight with its photo; medium adds tomorrow.
4. Long-press the new widget → **Edit Widget**. Set **Script** to *Tonight* and **When Interacting** to **Open URL**, so a tap opens tonight's recipe.

It also works on the lock screen: customize the lock screen, add a Scriptable widget, and pick *Tonight*.

iOS decides exactly when widgets refresh, usually every 15 to 60 minutes. Opening Scriptable updates it right away.

## Checking the Worker without Notion

`npm test` runs the Worker against a pretend Notion and checks reading, saving, the passcode, the widget answer, and that filling a whole month stays inside Cloudflare's free limits.
