import { TOPIC_IDS, type TopicDefinition, type TopicId } from "./types";

export const DEFAULT_TAXONOMY: readonly TopicDefinition[] = [
  { id: "ai_capex", label: "AI capex" },
  { id: "china_export_rules", label: "China / export rules" },
  { id: "scandal_governance", label: "Scandal / governance" },
  { id: "earnings_guidance", label: "Earnings / guidance" },
  { id: "rates_fed", label: "Rates / Fed" },
  { id: "macro_shock", label: "Macro shock" },
  { id: "other", label: "Other" },
];

export function isTopicId(value: string): value is TopicId {
  return (TOPIC_IDS as readonly string[]).includes(value);
}

export function topicLabel(id: TopicId, topics: readonly TopicDefinition[]): string {
  return topics.find((topic) => topic.id === id)?.label ?? id;
}

/**
 * Accepts a Remote Config JSON value for the taxonomy.
 * Unknown ids are dropped. `other` is always kept. An unusable value falls back
 * to the built-in list.
 */
export function parseTaxonomyConfig(
  raw: unknown,
): { topics: TopicDefinition[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!Array.isArray(raw)) {
    return {
      topics: DEFAULT_TAXONOMY.map((topic) => ({ ...topic })),
      warnings: ["topic_taxonomy was not a JSON array. Using the built-in taxonomy."],
    };
  }

  const topics: TopicDefinition[] = [];
  const seen = new Set<TopicId>();

  for (const entry of raw) {
    if (typeof entry === "string" && isTopicId(entry)) {
      if (seen.has(entry)) continue;
      seen.add(entry);
      const fallback = DEFAULT_TAXONOMY.find((topic) => topic.id === entry);
      topics.push({ id: entry, label: fallback?.label ?? entry });
      continue;
    }

    if (!entry || typeof entry !== "object") {
      warnings.push("Ignored a taxonomy entry that was not an object.");
      continue;
    }

    const record = entry as { id?: unknown; label?: unknown };
    if (typeof record.id !== "string" || !isTopicId(record.id)) {
      warnings.push(
        `Ignored taxonomy id "${String(record.id)}". Allowed ids are fixed: ${TOPIC_IDS.join(", ")}.`,
      );
      continue;
    }
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    const fallback = DEFAULT_TAXONOMY.find((topic) => topic.id === record.id);
    const label =
      typeof record.label === "string" && record.label.trim().length > 0
        ? record.label.trim().slice(0, 80)
        : (fallback?.label ?? record.id);
    topics.push({ id: record.id, label });
  }

  if (!seen.has("other")) {
    const other = DEFAULT_TAXONOMY.find((topic) => topic.id === "other");
    topics.push({ id: "other", label: other?.label ?? "Other" });
    warnings.push('Taxonomy was missing "other". It was added back.');
  }

  if (topics.length === 0) {
    return {
      topics: DEFAULT_TAXONOMY.map((topic) => ({ ...topic })),
      warnings: ["topic_taxonomy was empty. Using the built-in taxonomy."],
    };
  }

  return { topics, warnings };
}

export function coerceTopic(
  value: unknown,
  allowed: readonly TopicId[],
): { topic: TopicId; coerced: boolean } {
  const normalized =
    typeof value === "string"
      ? value
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, "_")
      : "";

  if (isTopicId(normalized) && allowed.includes(normalized)) {
    return { topic: normalized, coerced: false };
  }

  const aliases: Record<string, TopicId> = {
    ai: "ai_capex",
    capex: "ai_capex",
    ai_spend: "ai_capex",
    china: "china_export_rules",
    export_controls: "china_export_rules",
    governance: "scandal_governance",
    scandal: "scandal_governance",
    fraud: "scandal_governance",
    earnings: "earnings_guidance",
    guidance: "earnings_guidance",
    fed: "rates_fed",
    rates: "rates_fed",
    fomc: "rates_fed",
    macro: "macro_shock",
    recession: "macro_shock",
  };

  const alias = aliases[normalized];
  if (alias && allowed.includes(alias)) {
    return { topic: alias, coerced: true };
  }

  return { topic: "other", coerced: true };
}
