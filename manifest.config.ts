/** Builds manifest.json; the OAuth client ID comes from the environment so it is never hard-coded. */
export function buildManifest(env: { clientId: string; key?: string }) {
  return {
    manifest_version: 3,
    name: "Job Tracker Sync",
    version: "0.1.0",
    description:
      "Reads job emails in Gmail (rejections, interviews, OAs, offers) and updates the matching row in your Google Sheets tracker.",
    minimum_chrome_version: "116",
    ...(env.key ? { key: env.key } : {}),
    icons: { 16: "icons/icon16.png", 48: "icons/icon48.png", 128: "icons/icon128.png" },
    permissions: ["identity", "storage", "sidePanel"],
    host_permissions: [
      "https://mail.google.com/*",
      "https://sheets.googleapis.com/*",
      "https://generativelanguage.googleapis.com/*",
    ],
    // Calendar (optional feature) is requested at runtime from the options page.
    optional_host_permissions: ["https://www.googleapis.com/*"],
    oauth2: {
      client_id: env.clientId,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    },
    background: { service_worker: "background.js", type: "module" },
    content_scripts: [{ matches: ["https://mail.google.com/*"], js: ["content.js"] }],
    side_panel: { default_path: "sidepanel.html" },
    action: { default_title: "同步求职状态" },
    options_page: "options.html",
  };
}
