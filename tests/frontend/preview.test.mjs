import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const identity = "http://127.0.0.1:3000";
const registry = "http://127.0.0.1:43127";
const output = process.env.FRONTEND_SCREENSHOTS;

const identityRoutes = [
  ["login", "/login", "Sign in"],
  ["signup", "/signup", "Create an account"],
  ["recover", "/recover", "Recover access"],
  ["check-email", "/auth/check-email?intent=recover", "Check your email"],
  ["callback-expired", "/auth/callback", "Link couldn’t be verified"],
  ["passkey-setup", "/passkey/setup", "Set up a passkey"],
  ["consent-expired", "/oauth/consent", "Authorization unavailable"],
  ["sign-out", "/sign-out", "Sign out"],
  ["signed-out", "/auth/signed-out", "You’re signed out"],
  ["connected-apps", "/account/connected-apps", "Connected apps"],
  ["unknown", "/absent", "Page not found"],
];

async function withBrowser(width, run) {
  const browser = await chromium.launch({ executablePath: process.env.FRONTEND_CHROMIUM });
  try {
    const page = await browser.newPage({ viewport: { width, height: 850 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await run(page);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}

async function verifyScreen(page, name, width) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(overflow, false, `${name} overflows at ${width}px`);
  if (output) {
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: join(output, `${name}-${width}.png`), fullPage: true });
  }
}

for (const width of [320, 1440]) {
  test(`Identity preview screens at ${width}px`, async () => {
    await withBrowser(width, async (page) => {
      for (const [id, path, name] of identityRoutes) {
        await page.goto(identity + path);
        await page.getByRole("heading", { level: 1, name, exact: true }).waitFor();
        await verifyScreen(page, `identity-${id}`, width);
      }
      const response = await page.goto(identity + "/login");
      assert.match(await page.title(), /mini system Identity/);
      assert.match(response.headers()["cache-control"], /no-store/);
      assert.equal(response.headers()["x-frame-options"], "DENY");
      await page.keyboard.press("Tab");
      assert.equal(await page.evaluate(() => document.activeElement.id), "email");
      assert.ok(await page.getByRole("button", { name: "Continue with email" }).isVisible());
    });
  });

  test(`Registry Harbor preview at ${width}px`, async () => {
    await withBrowser(width, async (page) => {
      const response = await page.goto(registry);
      assert.match(await page.title(), /mini system Registry/);
      assert.equal(response.headers()["x-frame-options"], "DENY");
      const harbor = page.getByRole("navigation", { name: "Workspaces" }).getByRole("link", { name: /Harbor/ });
      await harbor.waitFor();
      await verifyScreen(page, "registry-workspaces", width);
      await harbor.click();
      await page.getByRole("link", { name: "Open Registry" }).click();
      const record = page.getByRole("link", { name: /Ada Meridian/ });
      await record.waitFor();
      await verifyScreen(page, "registry-search", width);

      const search = page.getByRole("searchbox", { name: "Search records" });
      await search.fill("no-sample-record-matches");
      await page.getByText("Nothing matches these filters", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Clear filters", exact: true }).click();
      assert.equal(await search.inputValue(), "");
      await record.click();
      await page.getByRole("heading", { level: 1, name: "Ada Meridian" }).waitFor();
      await verifyScreen(page, "registry-record", width);

      await page.goto(registry + "/account");
      await page.getByRole("group", { name: "Appearance" }).getByRole("button", { name: "dark" }).click();
      await page.locator("html.dark").waitFor({ state: "attached" });
      await verifyScreen(page, "registry-account-dark", width);
    });
  });
}
