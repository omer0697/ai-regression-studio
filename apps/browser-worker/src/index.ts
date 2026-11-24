import { loadConfig } from "./config.js";
import { loadCredentialStore } from "./credentials.js";
import { BrowserLifecycle } from "./browser/lifecycle.js";
import { SessionManager } from "./browser/session-manager.js";
import { DiscoverJobRunner } from "./runner.js";
import { buildApp } from "./app.js";

const config = loadConfig();
const browser = new BrowserLifecycle(config);
const credentials = loadCredentialStore(config);
const sessions = new SessionManager(browser);
const runner = new DiscoverJobRunner(browser, credentials, sessions);

const app = buildApp({ config, browser, credentials, sessions, runner });

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

async function shutdown() {
  await browser.shutdown().catch(() => undefined);
  await app.close().catch(() => undefined);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
