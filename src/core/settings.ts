import { parsePriceProvider } from "./price-feed";
import { DEFAULT_PROMPT_TEMPLATE } from "./prompt";
import { DEFAULT_TAXONOMY, parseTaxonomyConfig } from "./taxonomy";
import type { AppSettings, InferenceModeName } from "./types";

export const DEFAULT_CLOUD_MODEL = "gemini-3.5-flash-lite";

export const DEFAULT_SETTINGS: AppSettings = {
  inferenceMode: "prefer_on_device",
  cloudModel: DEFAULT_CLOUD_MODEL,
  promptTemplate: DEFAULT_PROMPT_TEMPLATE,
  topics: DEFAULT_TAXONOMY.map((topic) => ({ ...topic })),
  maxHeadlinesOnDevice: 8,
  maxCharsOnDevice: 6_000,
  longDocumentChars: 1_200,
  maxOutputTokens: 1_200,
  billingEnabled: false,
  freeCloudDailyLimit: 50,
  priceProvider: "kraken",
};

export const REMOTE_CONFIG_KEYS = [
  "inference_mode",
  "cloud_model",
  "prompt_template",
  "topic_taxonomy",
  "on_device_max_headlines",
  "on_device_max_chars",
  "long_document_chars",
  "max_output_tokens",
  "billing_enabled",
  "free_cloud_daily_limit",
  "price_provider",
  "coingecko_demo_api_key",
] as const;

export type RemoteConfigKey = (typeof REMOTE_CONFIG_KEYS)[number];

export function remoteConfigDefaults(): Record<RemoteConfigKey, string> {
  return {
    inference_mode: DEFAULT_SETTINGS.inferenceMode,
    cloud_model: DEFAULT_SETTINGS.cloudModel,
    prompt_template: DEFAULT_SETTINGS.promptTemplate,
    topic_taxonomy: JSON.stringify(DEFAULT_SETTINGS.topics),
    on_device_max_headlines: String(DEFAULT_SETTINGS.maxHeadlinesOnDevice),
    on_device_max_chars: String(DEFAULT_SETTINGS.maxCharsOnDevice),
    long_document_chars: String(DEFAULT_SETTINGS.longDocumentChars),
    max_output_tokens: String(DEFAULT_SETTINGS.maxOutputTokens),
    billing_enabled: DEFAULT_SETTINGS.billingEnabled ? "true" : "false",
    free_cloud_daily_limit: String(DEFAULT_SETTINGS.freeCloudDailyLimit),
    price_provider: DEFAULT_SETTINGS.priceProvider,
    coingecko_demo_api_key: "",
  };
}

const INFERENCE_MODES = new Set<InferenceModeName>([
  "prefer_on_device",
  "only_on_device",
  "prefer_in_cloud",
  "only_in_cloud",
]);

export function parseRemoteSettings(values: Record<string, string>): {
  settings: AppSettings;
  warnings: string[];
} {
  const warnings: string[] = [];
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    topics: DEFAULT_SETTINGS.topics.map((topic) => ({ ...topic })),
  };

  const mode = values.inference_mode?.trim();
  if (mode) {
    if (INFERENCE_MODES.has(mode as InferenceModeName)) {
      settings.inferenceMode = mode as InferenceModeName;
    } else {
      warnings.push(`inference_mode "${mode}" is not a Firebase AI Logic mode. Using prefer_on_device.`);
    }
  }

  const model = values.cloud_model?.trim();
  if (model) {
    if (/^[a-zA-Z0-9._-]{1,80}$/.test(model)) {
      settings.cloudModel = model;
    } else {
      warnings.push("cloud_model was not a usable model id. Using the SDK default.");
    }
  }

  const template = values.prompt_template;
  if (typeof template === "string" && template.trim().length > 0) {
    if (template.length > 8_000) {
      warnings.push("prompt_template was longer than 8000 characters. Using the built-in template.");
    } else {
      settings.promptTemplate = template;
    }
  }

  if (values.topic_taxonomy && values.topic_taxonomy.trim().length > 0) {
    try {
      const parsed = JSON.parse(values.topic_taxonomy) as unknown;
      const taxonomy = parseTaxonomyConfig(parsed);
      settings.topics = taxonomy.topics;
      warnings.push(...taxonomy.warnings);
    } catch {
      warnings.push("topic_taxonomy was not valid JSON. Using the built-in taxonomy.");
    }
  }

  settings.maxHeadlinesOnDevice = readBoundedInt(
    values.on_device_max_headlines,
    1,
    40,
    DEFAULT_SETTINGS.maxHeadlinesOnDevice,
    "on_device_max_headlines",
    warnings,
  );
  settings.maxCharsOnDevice = readBoundedInt(
    values.on_device_max_chars,
    500,
    20_000,
    DEFAULT_SETTINGS.maxCharsOnDevice,
    "on_device_max_chars",
    warnings,
  );
  settings.longDocumentChars = readBoundedInt(
    values.long_document_chars,
    200,
    20_000,
    DEFAULT_SETTINGS.longDocumentChars,
    "long_document_chars",
    warnings,
  );
  settings.billingEnabled = readBool(
    values.billing_enabled,
    DEFAULT_SETTINGS.billingEnabled,
    "billing_enabled",
    warnings,
  );
  settings.freeCloudDailyLimit = readBoundedInt(
    values.free_cloud_daily_limit,
    1,
    10_000,
    DEFAULT_SETTINGS.freeCloudDailyLimit,
    "free_cloud_daily_limit",
    warnings,
  );
  settings.maxOutputTokens = readBoundedInt(
    values.max_output_tokens,
    256,
    4_096,
    DEFAULT_SETTINGS.maxOutputTokens,
    "max_output_tokens",
    warnings,
  );

  const providerRaw = values.price_provider?.trim();
  if (providerRaw) {
    const provider = parsePriceProvider(providerRaw);
    if (provider !== providerRaw.toLowerCase()) {
      warnings.push(`price_provider "${providerRaw}" is not kraken or coingecko. Using kraken.`);
    }
    settings.priceProvider = provider;
  }

  return { settings, warnings };
}

function readBool(
  raw: string | undefined,
  fallback: boolean,
  key: string,
  warnings: string[],
): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = raw.trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  warnings.push(`${key} must be true or false. Using ${fallback}.`);
  return fallback;
}

function readBoundedInt(
  raw: string | undefined,
  min: number,
  max: number,
  fallback: number,
  key: string,
  warnings: string[],
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    warnings.push(`${key} must be an integer from ${min} to ${max}. Using ${fallback}.`);
    return fallback;
  }
  return value;
}
