/**
 * Configuration for context management.
 * Controls how conversation history is optimized for the LLM context window.
 */
export interface ContextConfig {
  /**
   * Maximum number of user turns to keep verbatim before trimming.
   * Older turns beyond this limit are either dropped or summarized.
   * @default 8
   */
  maxTurns: number;

  /**
   * When user turn count exceeds this value, older turns are summarized
   * instead of being dropped. Set to 0 to disable summarization.
   * @default 12
   */
  summarizeAfter: number;

  /**
   * Enable trimming of tool call results to reduce context size.
   * @default true
   */
  toolTrimEnabled: boolean;

  /**
   * Maximum characters from tool results kept in conversation context.
   * Outputs longer than this are truncated.
   * @default 8000
   */
  maxToolPayloadChars: number;

  /**
   * Model used for summarizing older conversation turns.
   * @default "gpt-4o-mini"
   */
  summaryModel: string;

  /**
   * Maximum tokens for generated context summary.
   * @default 400
   */
  summaryMaxTokens: number;

  /**
   * Emit context/usage metrics for observability.
   * @default true
   */
  metricsEnabled: boolean;
}

/**
 * Default context configuration values.
 */
export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  maxTurns: parseInt(process.env.CONTEXT_MAX_TURNS ?? "8", 10),
  summarizeAfter: parseInt(process.env.CONTEXT_SUMMARIZE_AFTER ?? "12", 10),
  toolTrimEnabled: process.env.CONTEXT_TOOL_TRIM_ENABLED !== "false",
  maxToolPayloadChars: parseInt(
    process.env.CONTEXT_MAX_TOOL_PAYLOAD_CHARS ?? "8000",
    10,
  ),
  summaryModel: process.env.CONTEXT_SUMMARY_MODEL ?? "gpt-4o-mini",
  summaryMaxTokens: parseInt(
    process.env.CONTEXT_SUMMARY_MAX_TOKENS ?? "400",
    10,
  ),
  metricsEnabled: process.env.CONTEXT_METRICS_ENABLED !== "false",
};

/**
 * Create a context configuration with overrides.
 */
export function createContextConfig(
  overrides: Partial<ContextConfig> = {},
): ContextConfig {
  return {
    ...DEFAULT_CONTEXT_CONFIG,
    ...overrides,
  };
}
