import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BrowserLifecycle } from "../browser/lifecycle.js";
import type { WorkerConfig } from "../config.js";
import { adapterFor } from "../adapters/index.js";
import { PlanExecutor } from "./plan-executor.js";

describe("PlanExecutor — document workflow capture", () => {
  const config: WorkerConfig = {
    port: 9101,
    host: "127.0.0.1",
    headless: true,
    apiBaseUrl: "http://127.0.0.1:1",
    internalToken: "test",
    credentialsFile: "unused.json",
  };

  let browser: BrowserLifecycle;

  beforeEach(() => {
    browser = new BrowserLifecycle(config);
  });

  afterEach(async () => {
    await browser.shutdown();
  });

  it("captures the real PDF download, the filled form fields and both workflow statuses", async () => {
    const context = await (await browser.acquire()).newContext();
    const page = await context.newPage();

    await page.setContent(`
      <html>
        <body>
          <label for="name">Ad Soyad</label>
          <input id="name" value="Ömer Yılmaz" />
          <label for="amount">Tutar</label>
          <input id="amount" value="1250,50" />
          <button id="btnPdf" type="button">PDF Oluştur</button>
          <button id="btnSendToSign" type="button">İmzaya Gönder</button>
          <button id="btnPublish" type="button">Yayınla</button>
          <div id="workflowStatusText" data-ars-workflow-status="TASLAK">Taslak</div>
          <script>
            document.getElementById("btnPdf").addEventListener("click", () => {
              const pdf = "%PDF-1.4\\n1 0 obj<<>>endobj\\ntrailer<<>>\\n%%EOF";
              const blob = new Blob([pdf], { type: "application/pdf" });
              const link = document.createElement("a");
              link.href = URL.createObjectURL(blob);
              link.download = "kpy68-form.pdf";
              document.body.appendChild(link);
              link.click();
              link.remove();
            });
            document.getElementById("btnSendToSign").addEventListener("click", () => {
              const box = document.getElementById("workflowStatusText");
              box.setAttribute("data-ars-workflow-status", "IMZAYA_GONDERILDI");
            });
            document.getElementById("btnPublish").addEventListener("click", () => {
              const box = document.getElementById("workflowStatusText");
              box.setAttribute("data-ars-workflow-status", "YAYINLANDI");
            });
          </script>
        </body>
      </html>
    `);

    const executor = new PlanExecutor(page, adapterFor("LEGACY_GWT"), 15_000);
    const snapshot = await executor.inspectDocumentAndWorkflows({
      includePdf: true,
      includeWorkflows: true,
    });

    expect(snapshot.pdfAvailable).toBe(true);
    expect(snapshot.pdfBytes).not.toBeNull();
    expect(snapshot.pdfBytes?.byteLength).toBeGreaterThan(0);
    expect(new TextDecoder().decode(snapshot.pdfBytes!.subarray(0, 5))).toBe("%PDF-");
    expect(snapshot.pdfFileName).toBe("kpy68-form.pdf");

    expect(snapshot.formFields["Ad Soyad"]).toBe("Ömer Yılmaz");
    expect(snapshot.formFields["Tutar"]).toBe("1250,50");

    expect(snapshot.signWorkflowStatus).toBe("IMZAYA_GONDERILDI");
    expect(snapshot.publishWorkflowStatus).toBe("YAYINLANDI");

    await context.close();
  }, 60_000);
});
