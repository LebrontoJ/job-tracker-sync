# Job Tracker Sync

A Manifest V3 Chrome extension that keeps your Google Sheets job-application
tracker in sync with your Gmail inbox.

Open a job-related email in Gmail and the side panel automatically extracts the
company, role, and email type (rejection, interview, online assessment, or
offer). One click finds the matching row across your sheets, lets you pick the
new status from the column's own dropdown options, and writes it back.

## Features

- Rule-based parsing for common ATS emails (Workday, Greenhouse, Lever, Ashby),
  with a free-tier Gemini API fallback for everything else
- Fuzzy matching on company and role across multiple sheets, with candidate
  selection when several rows match
- Drag-to-select fallback: highlight text in the email to correct the company or
  role, then search again
- Status suggestions mapped from email type, reading the status column's data
  validation options, with regression protection
- Write-time verification so the wrong row is never overwritten
- Optional: save interview time to a notes column and create a Calendar event

## Privacy

Only the subject line and the first ~1500 characters of the email body are sent
to the AI API, and only when rule-based parsing is insufficient. Your API key
and sheet configuration stay in local extension storage.

## Getting started

Requirements: Node.js ≥ 20, [pnpm](https://pnpm.io), Chrome ≥ 116.

```bash
pnpm install
cp .env.example .env   # then fill in VITE_OAUTH_CLIENT_ID (see below)
pnpm build
```

Then open `chrome://extensions`, enable **Developer mode**, choose
**Load unpacked**, and select the `dist/` folder.

### Google Cloud setup

Google sign-in needs an OAuth client bound to your extension's ID.

1. Load the unpacked extension once and copy its **ID** from `chrome://extensions`.
   (To keep the ID stable across machines, set `VITE_EXTENSION_KEY` to the
   extension's public key - see `.env.example`.)
2. In [Google Cloud Console](https://console.cloud.google.com/), create a project
   and enable the **Google Sheets API** (and the **Google Calendar API** if you
   want the calendar feature).
3. Configure the OAuth consent screen, adding the scope
   `https://www.googleapis.com/auth/spreadsheets`
   (plus `.../auth/calendar.events` for Calendar). While the app is in
   _Testing_, add your Google account as a test user.
4. Create credentials → **OAuth client ID** → application type **Chrome extension**,
   and paste the extension ID from step 1.
5. Put the client ID in `.env` as `VITE_OAUTH_CLIENT_ID`, run `pnpm build`, and
   reload the extension.

### First-time configuration

Open the extension's **Options** page:

1. Authorise your Google account, paste your spreadsheet link, and click
   **Read sheets**. Columns are guessed from the header row - confirm or change them.
2. Set which status each email type maps to, and the status order used for
   regression protection.
3. Optionally add a [Gemini API key](https://aistudio.google.com/apikey) for the AI fallback.

Then open any job email in Gmail and click the toolbar icon to open the side panel.

## Development

```bash
pnpm dev          # watch builds (reload the extension after changes)
pnpm test         # unit tests (Vitest)
pnpm typecheck
pnpm lint
pnpm format       # Prettier
pnpm package      # build + zip dist/ for sharing
```

### Project layout

```
src/
├─ core/         Pure, DOM- and Chrome-free logic (classifier, rule parser,
│                matcher, status flow, …) - fully unit-tested
├─ background/   MV3 service worker: OAuth, Sheets, Gemini, Calendar, message router
├─ content/      Gmail content script: reads the open email and text selections
├─ sidepanel/    Main UI (React)
├─ options/      Setup UI (React)
└─ shared/       Message types, storage and error helpers used across contexts
docs/DESIGN.md   Original design document
```

`core/` must not touch Chrome APIs or the DOM (enforced by ESLint), so it can be
tested in plain Node. The service worker is stateless: every request carries
what it needs and configuration is re-read from `chrome.storage.local`.

Gmail's CSS class names are obfuscated and may change. If the content script
stops reading emails, update the selectors in
[`src/content/extract.ts`](src/content/extract.ts); manual entry and drag-to-select
keep working in the meantime.

## License

[MIT](LICENSE)
