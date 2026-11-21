import type { DiscoveredElementRecord } from "@ars/shared-contracts";

import type { MappingPair } from "@ars/test-schemas";

/**
 * Deterministic GWT -> React element matching (Phase 5 baseline).
 *
 * Matching order per legacy element: exact label + type -> normalized label
 * (case/punctuation-insensitive) -> fuzzy label containment (flagged for
 * human review). AI-assisted refinement (Phase 4 adapter) can later raise
 * the confidence of ambiguous pairs; low-confidence matches are never
 * treated as verified — they carry needsReview and a low score.
 */
export function buildLabelMapping(
  legacy: DiscoveredElementRecord[],
  react: DiscoveredElementRecord[],
): MappingPair[] {
  const pairs: MappingPair[] = [];
  const usedReactRefs = new Set<string>();

  const reactByExact = indexBy(react, (element) =>
    element.label ? `${normalize(element.label)}|${element.elementType}` : "",
  );
  const reactByLabel = indexBy(react, (element) =>
    element.label ? normalize(element.label) : "",
  );

  for (const legacyElement of legacy) {
    if (!legacyElement.label) {
      pairs.push(unmatched(legacyElement, 0.3));
      continue;
    }
    const normalized = normalize(legacyElement.label);

    // 1) Exact normalized label + same type.
    const exactBucket = reactByExact.get(`${normalized}|${legacyElement.elementType}`);
    const exact = exactBucket?.find((candidate) => !usedReactRefs.has(candidate.ref));
    if (exact) {
      usedReactRefs.add(exact.ref);
      pairs.push(matched(legacyElement, exact, 0.95, false));
      continue;
    }

    // 2) Same normalized label, different type (still a strong signal).
    const sameLabel = reactByLabel.get(normalized)?.find(
      (candidate) => !usedReactRefs.has(candidate.ref),
    );
    if (sameLabel) {
      usedReactRefs.add(sameLabel.ref);
      pairs.push(matched(legacyElement, sameLabel, 0.8, false));
      continue;
    }

    // 3) Fuzzy: React label contains the legacy label (or vice versa).
    const fuzzy = react.find(
      (candidate) =>
        !usedReactRefs.has(candidate.ref) &&
        candidate.label &&
        (normalize(candidate.label).includes(normalized)
          || normalized.includes(normalize(candidate.label))),
    );
    if (fuzzy) {
      usedReactRefs.add(fuzzy.ref);
      pairs.push(matched(legacyElement, fuzzy, 0.5, true));
      continue;
    }

    pairs.push(unmatched(legacyElement, 0.3));
  }

  // Data tables pair by header signature (th texts), not by labels — GWT
  // layout tables carry no thead and must not produce field-level noise.
  const reactTables = react.filter(
    (element) => element.elementType === "table" && (element.options?.length ?? 0) > 0,
  );
  for (const pair of pairs) {
    if (pair.reactRef || !pair.legacyRef) {
      continue;
    }
    const legacyElement = legacy.find((element) => element.ref === pair.legacyRef);
    if (!legacyElement || legacyElement.elementType !== "table") {
      continue;
    }
    const signature = (legacyElement.options ?? []).map(normalize).join("|");
    if (!signature) {
      continue; // headerless layout table — stays unmatched, flagged for review
    }
    const match = reactTables.find(
      (candidate) =>
        !usedReactRefs.has(candidate.ref) &&
        (candidate.options ?? []).map(normalize).join("|") === signature,
    );
    if (match) {
      usedReactRefs.add(match.ref);
      pair.reactRef = match.ref;
      pair.reactLabel = match.label;
      pair.confidence = 0.9;
      pair.needsReview = false;
    }
  }

  return pairs;
}

function matched(
  legacy: DiscoveredElementRecord,
  react: DiscoveredElementRecord,
  confidence: number,
  needsReview: boolean,
): MappingPair {
  return {
    legacyRef: legacy.ref,
    legacyLabel: legacy.label,
    reactRef: react.ref,
    reactLabel: react.label,
    confidence,
    needsReview,
  };
}

function unmatched(legacy: DiscoveredElementRecord, confidence: number): MappingPair {
  return {
    legacyRef: legacy.ref,
    legacyLabel: legacy.label,
    reactRef: null,
    reactLabel: null,
    confidence,
    needsReview: true,
  };
}

function normalize(label: string): string {
  return label
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (char) =>
      ({ "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u" })[char] ?? char)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function indexBy(
  elements: DiscoveredElementRecord[],
  keyOf: (element: DiscoveredElementRecord) => string,
): Map<string, DiscoveredElementRecord[]> {
  const index = new Map<string, DiscoveredElementRecord[]>();
  for (const element of elements) {
    const key = keyOf(element);
    if (!key) {
      continue;
    }
    const bucket = index.get(key) ?? [];
    bucket.push(element);
    index.set(key, bucket);
  }
  return index;
}
