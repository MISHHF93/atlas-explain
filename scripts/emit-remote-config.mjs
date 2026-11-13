import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const descriptions = {
  inference_mode:
    "Firebase AI Logic mode: prefer_on_device, only_on_device, prefer_in_cloud, or only_in_cloud.",
  cloud_model:
    "Cloud Gemini model id used by inCloudParams when inference does not stay on device. The JS SDK 13 default is gemini-3.5-flash-lite.",
  prompt_template:
    "Prompt template. Placeholders: {{TAXONOMY}} {{QUESTION}} {{MOVE_CARD}} {{PRIVATE_CONTEXT}}.",
  topic_taxonomy: "JSON array of {id, label}. Ids must be the fixed taxonomy, and other is required.",
  on_device_max_headlines: "Headline count above this forces ONLY_IN_CLOUD and drops private notes.",
  on_device_max_chars: "Prompt length above this forces ONLY_IN_CLOUD and drops private notes.",
  long_document_chars: "Document length above this is treated as a long document and forced to the cloud.",
  max_output_tokens: "maxOutputTokens for the cloud model. Gemini 3.x ignores temperature, so it is not sent.",
};

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});

const { remoteConfigDefaults } = await server.ssrLoadModule("/src/core/settings.ts");
const defaults = remoteConfigDefaults();
const parameters = {};

for (const [key, value] of Object.entries(defaults)) {
  const description = descriptions[key];
  if (!description) throw new Error(`Missing description for ${key}`);
  parameters[key] = {
    defaultValue: { value },
    description,
    valueType: "STRING",
  };
}

const root = dirname(fileURLToPath(import.meta.url));
writeFileSync(
  join(root, "..", "remoteconfig.template.json"),
  `${JSON.stringify({ parameters, parameterGroups: {} }, null, 2)}\n`,
);

await server.close();
