import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const fixturesDir = resolve(import.meta.dirname, "fixtures");
const target = pathToFileURL(join(fixturesDir, "gwt-kpy68.html")).toString();
console.log("target:", target);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
try {
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 15000 });
  console.log("goto ok, url:", page.url());

  await page.waitForSelector(".gwt-TextBox, .gwt-ListBox, .gwt-TextArea, .gwt-Button, table[role='form'], .gwt-Root",
    { timeout: 15000 });
  console.log("ready ok");

  const screenshot = await page.screenshot({ fullPage: true, type: "png" });
  console.log("screenshot bytes:", screenshot.byteLength);

  const tracePath = join(process.env.TEMP ?? "/tmp", "ars-trace-debug.zip");
  await context.tracing.stop({ path: tracePath });
  const { readFile } = await import("node:fs/promises");
  const trace = await readFile(tracePath);
  console.log("trace bytes:", trace.byteLength);

  const elements = await page.evaluate("document.querySelectorAll('input').length");
  console.log("input count:", elements);
} catch (error) {
  console.error("FAILED:", error instanceof Error ? error.message : String(error));
} finally {
  await context.close();
  await browser.close();
}
