/**
 * Shared types for ATLAS Explain.
 * This module is platform-free so a Chrome extension or Android shell can reuse it.
 */

export const TOPIC_IDS = [
  "ai_capex",
  "china_export_rules",
  "scandal_governance",
  "earnings_guidance",
  "rates_fed",
  "macro_shock",
  "other",
] as const;

export type TopicId = (typeof TOPIC_IDS)[number];

export interface TopicDefinition {
  id: TopicId;
  label: string;
}

export interface PeerMove {
  symbol: string;
  movePct: number;
}

export interface Headline {
  text: string;
  source?: string;
}

/**
 * Structured description of one session move.
 * `notes` and `watchlist` are private and must not be sent to a cloud model
 * or written to Firestore.
 */
export interface MoveCard {
  symbol: string;
  asOf?: string;
  movePct: number;
  volumeVsNormal?: number;
  marketLabel?: string;
  marketMovePct?: number;
  sector?: string;
  sectorMovePct?: number;
  peerMoves: PeerMove[];
  volatilityNote?: string;
  upcomingEvents: string[];
  headlines: Headline[];
  /** Long text. Past a configured size, inference is forced to the cloud. */
  document?: string;
  /** Public note about how the figures were sourced. Sent with the prompt. */
  sourceNote?: string;
  notes?: string;
  watchlist: string[];
}

export interface FieldError {
  path: string;
  message: string;
}

export type InferenceModeName =
  | "prefer_on_device"
  | "only_on_device"
  | "prefer_in_cloud"
  | "only_in_cloud";

export type InferenceSourceName = "on_device" | "in_cloud" | "unknown";

export type PathReason =
  | "remote_config"
  | "many_headlines"
  | "long_prompt"
  | "long_document"
  | "private_context_on_device"
  | "private_context_too_long";

export interface PathLimits {
  maxHeadlinesOnDevice: number;
  maxCharsOnDevice: number;
  longDocumentChars: number;
}

export interface PathDecision {
  mode: InferenceModeName;
  includePrivateContext: boolean;
  /** When on-device init fails, retry in the cloud with private fields removed. */
  retryWithoutPrivate: boolean;
  reason: PathReason;
}

export interface HeadlineClassification {
  headline: string;
  topic: TopicId;
  note: string;
  coerced: boolean;
}

export interface ParsedExplanation {
  summary: string;
  headlineTopics: HeadlineClassification[];
  buyerReasons: [string, string, string];
  sellerReasons: [string, string, string];
  whatWouldChange: string;
  truncatedReasons: boolean;
}

export interface AppSettings {
  inferenceMode: InferenceModeName;
  cloudModel: string;
  promptTemplate: string;
  topics: TopicDefinition[];
  maxHeadlinesOnDevice: number;
  maxCharsOnDevice: number;
  longDocumentChars: number;
  maxOutputTokens: number;
}

export interface ExplanationRun {
  explanation: ParsedExplanation;
  inferenceSource: InferenceSourceName;
  requestedMode: InferenceModeName;
  pathReason: PathReason;
  privateContextUsed: boolean;
  fellBackToCloud: boolean;
  cloudModel: string;
  prompt: string;
}

export interface HybridExplainRequest {
  mode: InferenceModeName;
  prompt: string;
  cloudModel: string;
  maxOutputTokens: number;
  topics: readonly TopicId[];
  systemInstruction: string;
}

export interface HybridExplainResult {
  rawText: string;
  inferenceSource: InferenceSourceName;
}

export interface ExplainHooks {
  onDeviceDownloadProgress?: (ratio: number) => void;
}

/**
 * Platform port. The web app implements this with Firebase AI Logic.
 * A later Android shell can implement the same call with the Android SDK.
 */
export interface HybridExplainer {
  explain(request: HybridExplainRequest, hooks?: ExplainHooks): Promise<HybridExplainResult>;
}
