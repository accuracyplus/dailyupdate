# APML Daily GM Update — Setup Guide

A web-based daily update tool with Google Sheets as the database backend. Mobile-friendly. Works online (synced) or offline (local fallback).

---

## Files Provided

| File | Purpose |
|---|---|
| `apml_daily_app.html` | The web app — host this anywhere (Netlify, GitHub Pages, Azure, or open locally) |
| `apml_backend.gs` | Google Apps Script code — paste into your Google Sheet's Apps Script editor |

---

## Step 1 — Create the Google Sheet

1. Go to https://sheets.google.com and create a new blank spreadsheet.
2. Rename it to **APML Daily GM Update**.

---

## Step 2 — Add the Apps Script Backend

1. In the sheet, click **Extensions → Apps Script**.
2. Delete any default code in `Code.gs`.
3. Open `apml_backend.gs` (the file provided) in any text editor, copy all the contents, and paste into the Apps Script editor.
4. Click the **disk icon (Save)** and give the project a name like **APML Daily Backend**.

---

## Step 3 — Deploy as a Web App

1. In the Apps Script editor, click **Deploy → New deployment** (top right).
2. Click the **gear icon** next to "Select type" and choose **Web app**.
3. Fill in:
   - **Description**: `APML Daily Backend v1`
   - **Execute as**: `Me (your email)`
   - **Who has access**: `Anyone`
4. Click **Deploy**.
5. The first time, Google will ask you to **authorise**. Click through, choose your account, click **Advanced → Go to APML Daily Backend (unsafe)**, then **Allow**. (This is normal for personal Apps Scripts.)
6. Copy the **Web app URL** that appears. It looks like:
   `https://script.google.com/macros/s/AKfycbx.../exec`

---

## Step 4 — Host the HTML File

Pick whichever hosting option suits you:

### Option A — Netlify Drop (easiest, free, instant)
1. Go to https://app.netlify.com/drop
2. Drag and drop the `apml_daily_app.html` file (rename it to `index.html` first if you want a clean URL).
3. You'll get a public URL like `https://abcd-1234.netlify.app`.

### Option B — Azure Static Web Apps (matches your existing infra)
1. Same workflow you used for the lead tracker — create a new static site, upload the HTML.

### Option C — GitHub Pages
1. Push the file to a GitHub repo, enable Pages in repo settings.

### Option D — Open locally
1. Double-click `apml_daily_app.html` to open in any browser. Works fully on a single device.

---

## Step 5 — Connect the App to Google Sheets

1. Open the hosted app URL on your phone or browser.
2. Tap the **Settings** tab (last tab on top right).
3. Paste the **Web app URL** from Step 3.
4. Tap **Test Connection** — should show a green ✓.
5. Tap **Save & Connect**.
6. The header indicator switches from "Local" to "Synced".

---

## What Gets Created in the Sheet

When the first save happens, the script creates six tabs automatically:

| Sheet | Contents |
|---|---|
| `DailyEntries` | One row per day — flat columns for revenue, patients, calls, registrations, reports + a RawJSON column |
| `PC_Feedback` | Patient call feedback rows (one row per feedback call) |
| `FO_NotDelivered` | Undelivered reports (one row per pending report) |
| `Tasks` | All pending tasks |
| `Followups` | Task follow-up log (linked to tasks by TaskID) |
| `Targets` | Monthly targets (key-value) |

You can build pivot tables, charts, or Looker Studio dashboards directly on these sheets without touching the app.

---

## Day-to-Day Use

- **Morning**: Patient Coordinator and Front Office staff each open the app, switch to their role tab, fill in yesterday's data. Auto-saves as they type.
- **GM meeting**: Open the app on a tablet/laptop and walk through the dashboards. Switch to **Tasks** for action items, **History** for trends.
- **End of meeting**: Add new pending tasks or follow-ups to existing ones.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| "Could not reach the URL" on Test Connection | Re-deploy with **Anyone** access. Make sure you copied the full URL ending in `/exec`. |
| Header shows "Local" instead of "Synced" | Settings → paste the URL again → Save & Connect. |
| Old data not showing after switching to online mode | Local data stays on the device. Re-enter recent days, or export/import manually. |
| Want to change the URL later | Settings → Disconnect → paste new URL → Save & Connect. |

---

## Updating the App

If you want to change anything in the form (add fields, change layout, add a section), just edit the HTML file and re-upload to your host. The Google Sheet structure is forward-compatible — the `RawJSON` column captures everything regardless of which fields the app sends.

If you add new flat columns to the script, append them to `ENTRY_HEADERS` in the `.gs` file and redeploy.

---

## Security Notes

- The Apps Script Web App is set to **Anyone** access, meaning anyone with the URL can read/write. **Don't share the URL publicly** — keep it inside the staff WhatsApp group only.
- For tighter control, you can later restrict by changing **Who has access** to **Anyone with Google account** and adding email-check logic in the script (let me know and I can wire this up).
- The HTML file itself is a static file — it does not contain the Apps Script URL until you paste it in Settings, so the file is safe to share publicly.
