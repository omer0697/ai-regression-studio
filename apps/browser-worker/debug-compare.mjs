import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { BrowserLifecycle } from "./src/browser/lifecycle.js";
import { loadCredentialStore } from "./src/credentials.js";
import { ComparisonRunner } from "./src/comparison/comparison.js";

const fixturesDir = resolve(import.meta.dirname, "fixtures");
const config = {
  port: 9100, host: "127.0.0.1", headless: true,
  apiBaseUrl: "http://127.0.0.1:1", internalToken: "test",
  credentialsFile: join(fixturesDir, "credentials.example.json"),
};

const reporter = {
  events: [],
  async event(type, message, payload) { this.events.push({ type, message, payload }); },
  async status(update) { this.events.push({ type: "STATUS", message: JSON.stringify(update) }); },
  async artifact(type, name, _m, bytes) { this.events.push({ type: "ARTIFACT", message: `${name} ${bytes.byteLength}` }); },
  async mapping(r) { this.events.push({ type: "MAPPING", message: r.length + " pairs" }); },
  async findings(r) { this.events.push({ type: "FINDINGS", message: r.length + " findings" }); },
};

const browser = new BrowserLifecycle(config);
const runner = new ComparisonRunner(browser, loadCredentialStore(config));

const job = {
  jobType: "compare", executionId: 1, projectId: 7, screenCode: "KPY68", screenName: "KPY68", mode: "COMPARISON",
  plan: { scenarioName: "x", screen: "KPY68", steps: [{ action: "selectOption", target: "e3", value: "DIGER" }] },
  legacyApp: { projectId: 7, appType: "LEGACY_GWT", displayName: "GWT", baseUrl: pathToFileURL(join(fixturesDir, "gwt-kpy68.html")).toString(), environmentLabel: "TEST", authMethod: "NONE", allowedDomains: [], allowedActions: [], prohibitedActions: [], browserTimeoutMs: 15000, explorationMaxInteractions: 12, explorationMaxOptions: 3, screenshotEnabled: true },
  reactApp: { projectId: 7, appType: "REACT", displayName: "React", baseUrl: pathToFileURL(join(fixturesDir, "react-kpy68.html")).toString(), environmentLabel: "TEST", authMethod: "NONE", allowedDomains: [], allowedActions: [], prohibitedActions: [], browserTimeoutMs: 15000, explorationMaxInteractions: 12, explorationMaxOptions: 3, screenshotEnabled: true },
};

await runner.run(job, reporter);
for (const event of reporter.events) {
  console.log(`[${event.type}] ${event.message}`);
}
await browser.shutdown();
