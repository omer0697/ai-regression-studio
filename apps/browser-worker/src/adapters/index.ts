import type { AppType } from "@ars/shared-contracts";

import { GwtAdapter } from "./gwt.js";
import { ReactAdapter } from "./react.js";
import type { AppAdapter } from "./types.js";

/** The platform never assumes the same DOM exists in both applications. */
export function adapterFor(appType: AppType): AppAdapter {
  switch (appType) {
    case "LEGACY_GWT":
      return new GwtAdapter();
    case "REACT":
      return new ReactAdapter();
    default:
      throw new Error(`No adapter implemented for app type: ${appType as string}`);
  }
}
