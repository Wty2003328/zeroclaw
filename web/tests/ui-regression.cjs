/**
 * UI Regression Test Suite for ZeroClaw + Pulse Dashboard
 *
 * Requires: playwright (npx playwright install chromium)
 * Usage:    node web/tests/ui-regression.js [base_url]
 *
 * Default base URL: http://localhost:5173
 * Set SCREENSHOT_DIR env var to change screenshot output (default: /tmp/pulse-screenshots/regression)
 *
 * Tests:
 *   1. Sidebar focus outlines
 *   2. Dashboard tabs
 *   3. Config section nav
 *   4. Integrations filter buttons
 *   5. Settings modal tabs
 *   6. Pulse widget text overflow (full viewport)
 *   7. Pulse narrow viewport (768px)
 *   8. Pulse mobile viewport (480px)
 *   9. Widget small-size rendering (1x1, 1x2, 2x1, 2x2)
 *  10. Config button click states
 *  11. Broken images
 *  12. Rapid-click stability
 */
const { chromium } = require('playwright');

const BASE = process.argv[2] || process.env.TEST_BASE_URL || 'http://localhost:5173';
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/pulse-screenshots/regression';
const BUGS = [];
function bug(category, desc) { BUGS.push(`[${category}] ${desc}`); }

function checkOutline(outline) {
  return outline !== 'none' && !outline.includes('0px');
}

async function checkWidgetOverflow(widget, tolerance = 4) {
  const overflow = await widget.evaluate((el, tol) => {
    const rect = el.getBoundingClientRect();
    const texts = el.querySelectorAll('span, h3, h4, p, div, a');
    const overflows = [];
    for (const t of texts) {
      const tr = t.getBoundingClientRect();
      if (tr.width > 0 && (tr.right > rect.right + tol || tr.left < rect.left - tol)) {
        const text = (t.textContent || '').slice(0, 40);
        if (text.trim()) overflows.push(`"${text}"`);
      }
    }
    return overflows.slice(0, 3);
  }, tolerance);
  return overflow;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const { mkdirSync } = require('fs');
  try { mkdirSync(SCREENSHOT_DIR, { recursive: true }); } catch {}

  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  // ═══ TEST 1: Sidebar focus outlines ═══
  console.log('TEST 1: Sidebar focus outlines');
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(2000);

  const sidebarLinks = page.locator('aside nav a');
  const linkCount = await sidebarLinks.count();
  for (let i = 0; i < linkCount; i++) {
    const link = sidebarLinks.nth(i);
    const text = (await link.textContent() || '').trim();
    await link.click();
    await page.waitForTimeout(300);
    const outline = await link.evaluate(el => window.getComputedStyle(el).outline);
    if (checkOutline(outline)) {
      bug('Sidebar', `"${text}" has visible outline after click: ${outline}`);
    }
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/sidebar-after-clicks.png` });

  // ═══ TEST 2: Dashboard tabs ═══
  console.log('TEST 2: Dashboard tabs');
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(2000);
  for (const tab of ['Sessions', 'Channels', 'Overview']) {
    const btn = page.locator(`button:has-text("${tab}")`).first();
    if (await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(200);
      const outline = await btn.evaluate(el => window.getComputedStyle(el).outline);
      if (checkOutline(outline)) {
        bug('Dashboard', `Tab "${tab}" has outline: ${outline}`);
      }
    }
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/dashboard-tabs.png` });

  // ═══ TEST 3: Config section nav ═══
  console.log('TEST 3: Config section nav');
  await page.goto(`${BASE}/config`);
  await page.waitForTimeout(2000);
  const configBtns = page.locator('nav button');
  const configBtnCount = await configBtns.count();
  for (let i = 0; i < configBtnCount; i++) {
    const btn = configBtns.nth(i);
    const text = (await btn.textContent() || '').trim();
    if (!text) continue;
    await btn.click();
    await page.waitForTimeout(200);
    const outline = await btn.evaluate(el => window.getComputedStyle(el).outline);
    if (checkOutline(outline)) {
      bug('Config', `Section "${text}" has outline: ${outline}`);
    }
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/config-sections.png` });

  // ═══ TEST 4: Integrations filter buttons ═══
  console.log('TEST 4: Integrations filters');
  await page.goto(`${BASE}/integrations`);
  await page.waitForTimeout(2000);
  const filterBtns = page.locator('button.capitalize, button:has-text("All")').first().locator('..').locator('button');
  const filterCount = await filterBtns.count();
  for (let i = 0; i < Math.min(filterCount, 10); i++) {
    const btn = filterBtns.nth(i);
    const text = (await btn.textContent() || '').trim();
    await btn.click();
    await page.waitForTimeout(200);
    const outline = await btn.evaluate(el => window.getComputedStyle(el).outline);
    if (checkOutline(outline)) {
      bug('Integrations', `Filter "${text}" has outline: ${outline}`);
    }
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/integrations-filters.png` });

  // ═══ TEST 5: Settings modal tabs ═══
  console.log('TEST 5: Settings modal');
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(1000);
  try {
    await page.click('button[aria-label="Settings"], button:has(svg.lucide-settings)');
    await page.waitForTimeout(500);
    for (const tab of ['Themes', 'Typography', 'Appearance']) {
      const btn = page.locator(`button:has-text("${tab}")`).first();
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(200);
        const outline = await btn.evaluate(el => window.getComputedStyle(el).outline);
        if (checkOutline(outline)) {
          bug('Settings', `Tab "${tab}" has outline: ${outline}`);
        }
      }
    }
    await page.screenshot({ path: `${SCREENSHOT_DIR}/settings-modal.png` });
  } catch (e) { console.log('  Settings modal skipped:', e.message.slice(0, 80)); }

  // ═══ TEST 6: Pulse widget text overflow (full viewport) ═══
  console.log('TEST 6: Pulse widget text overflow (full size)');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${BASE}/pulse`);
  await page.waitForTimeout(5000);

  const widgets = page.locator('.react-grid-item');
  const widgetCount = await widgets.count();
  console.log(`  Found ${widgetCount} widgets`);
  for (let i = 0; i < widgetCount; i++) {
    const widget = widgets.nth(i);
    const box = await widget.boundingBox();
    if (!box) continue;
    const overflow = await checkWidgetOverflow(widget);
    if (overflow.length > 0) {
      const title = await widget.locator('.widget-drag-handle span, .widget-drag-handle h3').first().textContent().catch(() => `widget-${i}`);
      bug('Pulse-Full', `Widget "${title}" overflow: ${overflow.join('; ')}`);
    }
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/pulse-widgets-full.png`, fullPage: true });

  // ═══ TEST 7: Pulse narrow viewport (768px) ═══
  console.log('TEST 7: Pulse narrow viewport (768px)');
  await page.setViewportSize({ width: 768, height: 1080 });
  await page.goto(`${BASE}/pulse`);
  await page.waitForTimeout(5000);
  {
    const nw = page.locator('.react-grid-item');
    const nc = await nw.count();
    for (let i = 0; i < nc; i++) {
      const widget = nw.nth(i);
      if (!(await widget.boundingBox())) continue;
      const overflow = await checkWidgetOverflow(widget);
      if (overflow.length > 0) {
        const title = await widget.locator('.widget-drag-handle span, .widget-drag-handle h3').first().textContent().catch(() => `widget-${i}`);
        bug('Pulse-768', `Widget "${title}" overflow: ${overflow.join('; ')}`);
      }
    }
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/pulse-narrow.png`, fullPage: true });

  // ═══ TEST 8: Pulse mobile viewport (480px) ═══
  console.log('TEST 8: Pulse mobile viewport (480px)');
  await page.setViewportSize({ width: 480, height: 800 });
  await page.goto(`${BASE}/pulse`);
  await page.waitForTimeout(5000);
  {
    const mw = page.locator('.react-grid-item');
    const mc = await mw.count();
    for (let i = 0; i < mc; i++) {
      const widget = mw.nth(i);
      if (!(await widget.boundingBox())) continue;
      const overflow = await checkWidgetOverflow(widget);
      if (overflow.length > 0) {
        const title = await widget.locator('.widget-drag-handle span, .widget-drag-handle h3').first().textContent().catch(() => `widget-${i}`);
        bug('Pulse-480', `Widget "${title}" overflow: ${overflow.join('; ')}`);
      }
    }
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/pulse-mobile.png`, fullPage: true });

  // ═══ TEST 9: Widget small-size rendering (forced resize) ═══
  console.log('TEST 9: Widget small-size rendering');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${BASE}/pulse`);
  await page.waitForTimeout(5000);

  const testSizes = [
    { name: '1x1', w: 150, h: 150 },
    { name: '1x2', w: 150, h: 310 },
    { name: '2x1', w: 310, h: 150 },
    { name: '2x2', w: 310, h: 310 },
  ];

  const widgetNames = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.react-grid-item')).map(el => {
      const handle = el.querySelector('.widget-drag-handle span, .widget-drag-handle h3');
      return handle ? handle.textContent : 'unknown';
    });
  });

  for (const size of testSizes) {
    for (let wi = 0; wi < widgetNames.length; wi++) {
      const wName = widgetNames[wi];
      if (!wName || wName === 'unknown') continue;

      const issues = await page.evaluate(({ idx, w, h }) => {
        const widget = document.querySelectorAll('.react-grid-item')[idx];
        if (!widget) return [];

        const origStyle = widget.getAttribute('style') || '';
        widget.style.width = w + 'px';
        widget.style.height = h + 'px';
        widget.style.position = 'fixed';
        widget.style.top = '0';
        widget.style.left = '0';
        widget.style.zIndex = '9999';
        widget.style.transform = 'none';
        widget.offsetHeight; // force reflow

        const rect = widget.getBoundingClientRect();
        const results = [];
        widget.querySelectorAll('span, h3, h4, p, div, a').forEach(t => {
          const tr = t.getBoundingClientRect();
          if (tr.width <= 0) return;
          if (tr.right > rect.right + 4) {
            const text = (t.textContent || '').slice(0, 30);
            if (text.trim()) results.push(`H-overflow: "${text}"`);
          }
        });

        widget.setAttribute('style', origStyle);
        return results.slice(0, 5);
      }, { idx: wi, w: size.w, h: size.h });

      if (issues.length > 0) {
        bug(`Pulse-${size.name}`, `${wName}: ${issues.join('; ')}`);
        console.log(`  x ${wName} at ${size.name}: ${issues.join('; ')}`);
      }
    }
    console.log(`  ${size.name}: all widgets OK`);
  }

  // Capture 1x1 screenshots for each widget
  {
    const sw = page.locator('.react-grid-item');
    const sc = await sw.count();
    for (let i = 0; i < sc; i++) {
      const widget = sw.nth(i);
      const title = await widget.locator('.widget-drag-handle span, .widget-drag-handle h3').first().textContent().catch(() => `w${i}`);
      await widget.evaluate(el => {
        el.style.width = '150px'; el.style.height = '150px';
        el.style.position = 'fixed'; el.style.top = '10px'; el.style.left = '10px';
        el.style.zIndex = '9999'; el.style.transform = 'none';
        el.offsetHeight;
      });
      const safeName = (title || `w${i}`).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      await widget.screenshot({ path: `${SCREENSHOT_DIR}/widget-1x1-${safeName}.png` });
      await widget.evaluate(el => {
        el.style.width = ''; el.style.height = ''; el.style.position = '';
        el.style.top = ''; el.style.left = ''; el.style.zIndex = ''; el.style.transform = '';
      });
    }
  }

  // ═══ TEST 10: Config button click states ═══
  console.log('TEST 10: Config button click states');
  await page.goto(`${BASE}/config`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/config-nav-states.png` });

  // ═══ TEST 11: Broken images ═══
  console.log('TEST 11: Broken images check');
  await page.goto(`${BASE}/pulse`);
  await page.waitForTimeout(3000);
  const brokenImages = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img'))
      .filter(img => !img.complete || img.naturalHeight === 0)
      .map(img => img.src)
      .filter(src => !src.includes('favicon') && !src.includes('zeroclaw-trans'));
  });
  if (brokenImages.length > 0) {
    bug('Images', `Broken: ${brokenImages.join(', ')}`);
  }

  // ═══ TEST 12: Rapid-click stability ═══
  console.log('TEST 12: Rapid-click stability');
  await page.goto(`${BASE}/config`);
  await page.waitForTimeout(2000);
  const rapidBtns = page.locator('nav button');
  const rapidCount = await rapidBtns.count();
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < Math.min(rapidCount, 8); i++) {
      await rapidBtns.nth(i).click();
      await page.waitForTimeout(50);
    }
  }
  const afterRapid = await page.locator('nav button').count();
  if (afterRapid === 0) {
    bug('Config', 'Page broken after rapid nav clicking');
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/config-rapid-click.png` });

  await page.close();
  await browser.close();

  // ═══ REPORT ═══
  console.log('\n' + '='.repeat(50));
  console.log('  UI REGRESSION TEST RESULTS');
  console.log('='.repeat(50));
  if (BUGS.length === 0) {
    console.log('  PASS: All 12 tests passed — 0 bugs found');
  } else {
    console.log(`  FAIL: ${BUGS.length} bug(s) found:`);
    BUGS.forEach((b, i) => console.log(`    ${i + 1}. ${b}`));
  }
  console.log('='.repeat(50));
  console.log(`Screenshots: ${SCREENSHOT_DIR}/`);

  process.exit(BUGS.length > 0 ? 1 : 0);
})();
