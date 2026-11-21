import { readFileSync, existsSync } from "node:fs";

import type { WorkerConfig } from "./config.js";

export interface TestCredential {
  username: string;
  password: string;
}

export type CredentialStore = Map<string, TestCredential>;

/**
 * Loads the local credential store. The file maps credential references to
 * test accounts and lives outside version control (git-ignored); production
 * replaces this with the company secret store.
 */
export function loadCredentialStore(config: WorkerConfig): CredentialStore {
  if (!existsSync(config.credentialsFile)) {
    return new Map();
  }
  const raw = JSON.parse(readFileSync(config.credentialsFile, "utf-8")) as Record<
    string,
    TestCredential
  >;
  return new Map(Object.entries(raw));
}
