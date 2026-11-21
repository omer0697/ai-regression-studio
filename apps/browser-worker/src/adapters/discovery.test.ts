import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { chromium } from "playwright";

import { GwtAdapter } from "./gwt.js";
import { ReactAdapter } from "./react.js";

const fixturesDir = resolve(import.meta.dirname ?? ".", "../../fixtures");

async function openFixture(name: string) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(pathToFileURL(join(fixturesDir, name)).toString());
  await page.waitForLoadState("domcontentloaded");
  return { browser, context, page };
}

describe("GwtAdapter — real Chromium against the GWT-like fixture", () => {
  it("discovers labeled fields, disabled state, options and tables", async () => {
    const { browser, page } = await openFixture("gwt-kpy68.html");
    try {
      const adapter = new GwtAdapter();
      await adapter.waitForReady(page, 10_000);
      const elements = await adapter.discoverElements(page);

      const byRefType = (elementType: string) =>
        elements.filter((element) => element.elementType === elementType);

      // Text input with a GWT table-cell label.
      const codeField = elements.find((element) => element.value === "KPY-001");
      expect(codeField).toBeDefined();
      expect(codeField?.label).toBe("Parametre Kodu");
      expect(codeField?.enabled).toBe(true);
      expect(codeField?.visible).toBe(true);
      expect(codeField?.required).toBe(true);

      // Disabled dependent field.
      const valueField = elements.find(
        (element) => element.label === "Parametre Değeri",
      );
      expect(valueField?.enabled).toBe(false);

      // Select with options.
      const select = byRefType("select").at(0);
      expect(select?.options).toEqual(["STANDART", "OZEL", "DIGER"]);
      expect(select?.value).toBe("OZEL");

      // Hidden field is recorded but marked invisible.
      const hidden = elements.find((element) => element.elementType === "hidden");
      expect(hidden).toBeDefined();
      expect(hidden?.visible).toBe(false);
      expect(hidden?.value).toBe("internal-123");

      // Checkbox, radios, textarea, date and buttons.
      expect(byRefType("checkbox").length).toBe(1);
      expect(byRefType("checkbox").at(0)?.value).toBe("true");
      expect(byRefType("radio").length).toBe(2);
      expect(byRefType("textarea").length).toBe(2); // Açıklama + koşullu Onay Notu (gizli)
      expect(byRefType("date").length).toBe(1);
      expect(byRefType("button").length).toBeGreaterThanOrEqual(3);

      // Result data table with its label. (GWT also uses tables for layout —
      // the form layout table is recorded first, which is honest discovery.)
      const dataTable = elements.find(
        (element) =>
          element.elementType === "table" &&
          element.label?.includes("Sorgu Sonuçları"),
      );
      expect(dataTable?.value?.startsWith("3x4 ##")).toBe(true);
      expect(dataTable?.value).toContain("XYZ-9");
      expect(dataTable?.options).toEqual(["Kod", "Tip", "Değer", "Durum"]);
      expect(byRefType("table").length).toBe(2);

      // Every record has a stable ref and a DOM path.
      for (const element of elements) {
        expect(element.ref).toMatch(/^e\d+$/);
        expect(element.domPath).toBeTruthy();
      }
      expect(elements.length).toBeGreaterThan(10);
    } finally {
      await browser.close();
    }
  });
});

describe("ReactAdapter — real Chromium against the defective React-like fixture", () => {
  it("discovers ant-form-item labels and records the defective baseline honestly", async () => {
    const { browser, page } = await openFixture("react-kpy68.html");
    try {
      const adapter = new ReactAdapter();
      await adapter.waitForReady(page, 10_000);
      const elements = await adapter.discoverElements(page);

      const codeField = elements.find((element) => element.label === "Parametre Kodu");
      expect(codeField?.label).toBe("Parametre Kodu");

      // Defect 5: the API-bound code field renders empty (GWT: KPY-001).
      // The discovery normalizes empty values to null ("no value").
      expect(codeField?.value).toBeNull();

      const disabledValue = elements.find((element) => element.label === "Parametre Değeri");
      expect(disabledValue?.enabled).toBe(false);

      // Defect 1: the Açıklama textarea is missing entirely.
      expect(elements.filter((element) => element.elementType === "textarea")).toHaveLength(0);

      // Ant Design renders buttons as [role=button] spans.
      expect(
        elements.filter((element) => element.elementType === "button").length,
      ).toBeGreaterThanOrEqual(3);

      const table = elements.find((element) => element.elementType === "table");
      expect(table).toBeDefined();
      expect(table?.value?.startsWith("3x4 ##")).toBe(true);
      expect(table?.value).toContain("XYZ-8");
      expect(table?.options).toEqual(["Kod", "Tip", "Değer", "Durum"]);
    } finally {
      await browser.close();
    }
  });
});
