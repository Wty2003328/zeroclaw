# UI Regression Tests

Automated Playwright tests that verify the ZeroClaw + Pulse Dashboard frontend has no visual regressions — focus outlines, text overflow, broken images, click stability, and responsive layout.

## Prerequisites

```bash
npm install -g playwright
npx playwright install chromium
```

## Running

Start a dev server first (either Vite or ZeroClaw gateway), then run:

```bash
# Against Vite dev server (hot-reload, fastest iteration)
ZEROCLAW_GATEWAY_PORT=5757 npx vite --port 5173
NODE_PATH=/tmp/node_modules node web/tests/ui-regression.cjs http://localhost:5173

# Against ZeroClaw gateway directly (tests the production build)
node web/tests/ui-regression.cjs http://localhost:5757
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `TEST_BASE_URL` | `http://localhost:5173` | Base URL (also accepts CLI arg) |
| `SCREENSHOT_DIR` | `/tmp/pulse-screenshots/regression` | Where screenshots are saved |

### Exit code

- `0` — all tests passed
- `1` — one or more bugs found

## Test catalog

| # | Test | What it checks |
|---|---|---|
| 1 | Sidebar focus outlines | Clicking every sidebar link produces no visible `outline` |
| 2 | Dashboard tabs | Sessions / Channels / Overview tabs have no focus ring |
| 3 | Config section nav | All config nav buttons clickable without focus artifacts |
| 4 | Integrations filters | Filter buttons (All, messaging, etc.) have no outline |
| 5 | Settings modal tabs | Themes / Typography / Appearance tabs focus-clean |
| 6 | Widget overflow (1920px) | No horizontal text overflow in any Pulse widget at full size |
| 7 | Widget overflow (768px) | Same check at tablet-width viewport |
| 8 | Widget overflow (480px) | Same check at mobile-width viewport |
| 9 | Small-size rendering | Force each widget to 1x1, 1x2, 2x1, 2x2 (150px cell) — no overflow; also captures 1x1 screenshots |
| 10 | Config button states | Verifies config nav buttons are clickable and page renders |
| 11 | Broken images | Scans Pulse page for `<img>` elements that failed to load |
| 12 | Rapid-click stability | Clicks config nav 24 times rapidly — page must not break |

## Screenshots

Every run saves PNG screenshots to `SCREENSHOT_DIR`:

```
pulse-widgets-full.png      # Full dashboard at 1920x1080
pulse-narrow.png            # Dashboard at 768px
pulse-mobile.png            # Dashboard at 480px
widget-1x1-feed.png         # Each widget forced to 150x150
widget-1x1-digest.png
widget-1x1-weather.png
...
sidebar-after-clicks.png    # Sidebar after clicking all items
config-sections.png         # Config page
settings-modal.png          # Settings modal
```

## Adding new tests

Follow the existing pattern:

```javascript
// ═══ TEST N: Description ═══
console.log('TEST N: Description');
await page.goto(`${BASE}/your-page`);
await page.waitForTimeout(2000);

// ... your checks ...
if (somethingWrong) {
  bug('Category', 'What went wrong');
}
await page.screenshot({ path: `${SCREENSHOT_DIR}/your-test.png` });
```

The `bug(category, description)` function collects failures. The test exits with code 1 if any bugs are found.

## When to run

- After any frontend component change
- After CSS / theme changes
- After adding or modifying Pulse widgets
- Before merging PRs that touch `web/src/`
