import { CoreMessage, ToolResultPart } from "ai";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { ContextConfig, createContextConfig } from "./config";
import { CONTEXT_SUMMARY_PROMPT } from "../prompts";
import { insertContextMetrics } from "@/lib/repositories/mongodb/context-metrics";

/**
 * Message role types for context management.
 */
type MessageRole = "user" | "assistant" | "system" | "tool";

/**
 * Internal message representation for context optimization.
 */
interface InternalMessage {
  role: MessageRole;
  content: string | CoreMessage["content"];
  toolEvents?: ToolEvent[];
}

/**
 * Tool event for tracking tool calls and results.
 */
interface ToolEvent {
  type: "tool_call" | "tool_result";
  tool: string;
  args?: Record<string, unknown>;
  result?: unknown;
  toolCallId?: string;
  trimmed?: boolean;
}

/**
 * Metrics for context optimization.
 */
interface ContextMetricsData {
  conversationId: string;
  userId: number;
  rawMessageCount: number;
  optimizedMessageCount: number;
  turnCount: number;
  toolTrimCount: number;
  summaryAdded: boolean;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * ContextSession manages conversation context optimization.
 *
 * It provides:
 * - Turn-based trimming to keep context within limits
 * - Tool result compression to reduce payload size
 * - Summary injection for long conversations
 * - Metrics tracking for observability
 */
export class ContextSession {
  private config: ContextConfig;
  private conversationId: string;
  private userId: number;
  private rawMessages: InternalMessage[] = [];
  private optimizedMessages: CoreMessage[] = [];
  private contextDirty = true;
  private lastSummaryTurn = 0;
  private summaryAddedLastRefresh = false;
  private toolTrimCountLastRefresh = 0;

  constructor(
    conversationId: string,
    userId: number,
    config?: Partial<ContextConfig>
  ) {
    this.conversationId = conversationId;
    this.userId = userId;
    this.config = createContextConfig(config);
  }

  /**
   * Add messages to the session.
   */
  addMessages(messages: CoreMessage[]): void {
    for (const msg of messages) {
      this.rawMessages.push({
        role: msg.role as MessageRole,
        content: msg.content,
      });
    }
    this.contextDirty = true;
  }

  /**
   * Get optimized messages for the LLM.
   * Applies turn trimming, tool compression, and summary injection.
   */
  async getOptimizedMessages(): Promise<CoreMessage[]> {
    if (!this.contextDirty) {
      return this.optimizedMessages;
    }

    await this.refreshOptimizedCache();
    this.contextDirty = false;
    return this.optimizedMessages;
  }

  /**
   * Refresh the optimized message cache.
   */
  private async refreshOptimizedCache(): Promise<void> {
    if (this.rawMessages.length === 0) {
      this.optimizedMessages = [];
      return;
    }

    // Reset per-refresh tracking
    this.summaryAddedLastRefresh = false;
    this.toolTrimCountLastRefresh = 0;

    // Step 1: Apply turn-based trimming
    const { recent, older } = this.applyTurnBasedTrimming();

    // Step 2: Apply tool result trimming
    const trimmedRecent = this.config.toolTrimEnabled
      ? this.applyToolTrimming(recent)
      : recent;

    // Step 3: Inject summary if needed
    const finalMessages = await this.injectSummaryIfNeeded(
      trimmedRecent,
      older
    );

    // Convert to CoreMessage format
    this.optimizedMessages = this.toSdkFormat(finalMessages);

    // Record metrics if enabled
    if (this.config.metricsEnabled) {
      await this.recordMetrics();
    }
  }

  /**
   * Apply turn-based trimming to keep last N user turns.
   */
  private applyTurnBasedTrimming(): {
    recent: InternalMessage[];
    older: InternalMessage[];
  } {
    const messages = [...this.rawMessages];

    // Find all user message indices
    const userIndices: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === "user") {
        userIndices.push(i);
      }
    }

    const turnCount = userIndices.length;

    // If within limit, return all as recent
    if (turnCount <= this.config.maxTurns) {
      return { recent: messages, older: [] };
    }

    // Find the start index of the recent window
    const startIndex = userIndices[userIndices.length - this.config.maxTurns];

    // Split messages
    const systemMessages = messages.filter((m) => m.role === "system");
    const older = messages
      .slice(0, startIndex)
      .filter((m) => m.role !== "system");
    const recentTail = messages.slice(startIndex);

    // Combine: system messages first, then recent tail
    const recent = [...systemMessages, ...recentTail];

    return { recent, older };
  }

  /**
   * Apply tool result trimming to compress large payloads.
   */
  private applyToolTrimming(messages: InternalMessage[]): InternalMessage[] {
    return messages.map((msg) => {
      if (msg.role !== "assistant" || !msg.toolEvents) {
        return msg;
      }

      const trimmedEvents = msg.toolEvents.map((event) => {
        if (event.type !== "tool_result" || !event.result) {
          return event;
        }

        const trimmed = this.trimToolResult(event.tool, event.result);
        if (trimmed !== event.result) {
          this.toolTrimCountLastRefresh++;
          return { ...event, result: trimmed, trimmed: true };
        }
        return event;
      });

      return { ...msg, toolEvents: trimmedEvents };
    });
  }

  /**
   * Trim a tool result based on tool type and size limits.
   */
  private trimToolResult(toolName: string, result: unknown): unknown {
    if (typeof result !== "object" || result === null) {
      return result;
    }

    const resultObj = result as Record<string, unknown>;

    // Tool-specific trimming
    switch (toolName) {
      case "find_people":
        return this.trimFindPeopleResult(resultObj);
      case "get_person_details":
        return this.trimPersonDetailsResult(resultObj);
      case "analyze_network":
        return this.trimAnalyzeNetworkResult(resultObj);
      case "get_feed_signals":
        return this.trimFeedSignalsResult(resultObj);
      case "get_group_members":
        return this.trimGroupMembersResult(resultObj);
      default:
        return this.genericTrim(resultObj);
    }
  }

  /**
   * Trim find_people results to limit profile count.
   */
  private trimFindPeopleResult(result: Record<string, unknown>): unknown {
    const maxProfiles = 50;
    if (Array.isArray(result.results) && result.results.length > maxProfiles) {
      return {
        ...result,
        results: result.results.slice(0, maxProfiles).map(this.compressProfile),
        trimmed: true,
        original_count: result.results.length,
      };
    }

    if (Array.isArray(result.results)) {
      return {
        ...result,
        results: result.results.map(this.compressProfile),
      };
    }

    return result;
  }

  /**
   * Trim person details to essential fields.
   */
  private trimPersonDetailsResult(result: Record<string, unknown>): unknown {
    const profile = result.profile as Record<string, unknown> | undefined;
    if (!profile) return result;

    // Keep only first 3 of array fields
    const limitedProfile: Record<string, unknown> = { ...profile };
    const arrayFields = ["sectors", "locations", "stages", "companies"];

    for (const field of arrayFields) {
      if (Array.isArray(limitedProfile[field])) {
        limitedProfile[field] = (limitedProfile[field] as unknown[]).slice(
          0,
          3
        );
      }
    }

    return { ...result, profile: limitedProfile };
  }

  /**
   * Trim analyze_network results.
   */
  private trimAnalyzeNetworkResult(result: Record<string, unknown>): unknown {
    const maxProfiles = 50;
    const profiles = result.profiles as unknown[] | undefined;

    if (Array.isArray(profiles) && profiles.length > maxProfiles) {
      return {
        ...result,
        profiles: profiles.slice(0, maxProfiles).map(this.compressProfile),
        trimmed: true,
        original_count: profiles.length,
      };
    }

    return result;
  }

  /**
   * Trim feed signals results.
   */
  private trimFeedSignalsResult(result: Record<string, unknown>): unknown {
    const maxSignals = 50;
    const signals = result.signals as unknown[] | undefined;

    if (Array.isArray(signals) && signals.length > maxSignals) {
      return {
        ...result,
        signals: signals.slice(0, maxSignals),
        trimmed: true,
        original_count: signals.length,
      };
    }

    return result;
  }

  /**
   * Trim group members results.
   */
  private trimGroupMembersResult(result: Record<string, unknown>): unknown {
    const maxMembers = 50;
    const members = result.members as unknown[] | undefined;

    if (Array.isArray(members) && members.length > maxMembers) {
      return {
        ...result,
        members: members.slice(0, maxMembers).map(this.compressProfile),
        trimmed: true,
        original_count: members.length,
      };
    }

    return result;
  }

  /**
   * Generic trim for unknown tool results.
   */
  private genericTrim(result: Record<string, unknown>): unknown {
    const jsonStr = JSON.stringify(result);
    if (jsonStr.length <= this.config.maxToolPayloadChars) {
      return result;
    }

    // Truncate with indicator
    const truncated = jsonStr.slice(0, this.config.maxToolPayloadChars);
    return {
      raw_output: truncated,
      truncated: true,
      original_length: jsonStr.length,
    };
  }

  /**
   * Compress a profile to essential fields for context.
   */
  private compressProfile = (profile: unknown): Record<string, unknown> => {
    if (typeof profile !== "object" || profile === null) {
      return {};
    }
    const p = profile as Record<string, unknown>;
    const essential = [
      "user_id",
      "name",
      "screen_name",
      "headline",
      "trending_score",
      "followed_by_count",
      "stealth_status",
      "recent_bio_change",
      "profile_url",
    ];

    const compressed: Record<string, unknown> = {};
    for (const key of essential) {
      if (p[key] !== undefined) {
        compressed[key] = p[key];
      }
    }

    // Add signal summary
    const signals: string[] = [];
    if (p.recent_bio_change) signals.push("bio changed");
    if (p.stealth_status) signals.push(`stealth: ${p.stealth_status}`);
    if ((p.trending_score as number) > 7) signals.push("trending");
    if ((p.total_signals as number) > 5) {
      signals.push(`${p.total_signals} signals`);
    }

    if (signals.length > 0) {
      compressed.signal_summary = signals.join(", ");
    }

    return compressed;
  };

  /**
   * Inject summary if conversation is long enough.
   */
  private async injectSummaryIfNeeded(
    recent: InternalMessage[],
    older: InternalMessage[]
  ): Promise<InternalMessage[]> {
    // No older messages = no summary needed
    if (older.length === 0) {
      return recent;
    }

    // Check if summarization is enabled
    if (this.config.summarizeAfter <= 0) {
      return recent;
    }

    // Count total user turns
    const totalTurns = this.countUserTurns(this.rawMessages);

    // Check if we've exceeded the threshold
    if (totalTurns <= this.config.summarizeAfter) {
      return recent;
    }

    // Check if we've already summarized this history
    if (totalTurns <= this.lastSummaryTurn) {
      return recent;
    }

    // Generate summary
    const summary = await this.summarizeContext(older);
    if (!summary) {
      return recent; // Summarization failed, just use recent
    }

    this.summaryAddedLastRefresh = true;
    this.lastSummaryTurn = totalTurns;

    // Prepend summary as user/assistant exchange
    const summaryMessages: InternalMessage[] = [
      {
        role: "user",
        content: "Summarize our conversation so far for context.",
      },
      {
        role: "assistant",
        content: summary,
      },
    ];

    // Keep system messages at the start
    const systemMessages = recent.filter((m) => m.role === "system");
    const nonSystemRecent = recent.filter((m) => m.role !== "system");

    return [...systemMessages, ...summaryMessages, ...nonSystemRecent];
  }

  /**
   * Generate a summary of older messages.
   */
  private async summarizeContext(
    messages: InternalMessage[]
  ): Promise<string | null> {
    try {
      const transcript = this.renderMessagesForSummary(messages);

      const { text } = await generateText({
        model: openai(this.config.summaryModel),
        system: CONTEXT_SUMMARY_PROMPT,
        prompt: transcript,
        maxOutputTokens: this.config.summaryMaxTokens,
        temperature: 0.3,
      });

      return text;
    } catch (error) {
      console.error("[ContextSession] Summarization failed:", error);
      return null;
    }
  }

  /**
   * Render messages as readable transcript for summarization.
   */
  private renderMessagesForSummary(messages: InternalMessage[]): string {
    return messages
      .map((msg) => {
        const role = msg.role.toUpperCase();
        const content =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);
        return `${role}: ${content}`;
      })
      .join("\n\n");
  }

  /**
   * Count user turns in messages.
   */
  private countUserTurns(messages: InternalMessage[]): number {
    return messages.filter((m) => m.role === "user").length;
  }

  /**
   * Convert internal messages to SDK format.
   */
  private toSdkFormat(messages: InternalMessage[]): CoreMessage[] {
    return messages.map((msg) => {
      if (typeof msg.content === "string") {
        return {
          role: msg.role,
          content: msg.content,
        } as CoreMessage;
      }

      return {
        role: msg.role,
        content: msg.content,
      } as CoreMessage;
    });
  }

  /**
   * Record context metrics to the database.
   */
  private async recordMetrics(): Promise<void> {
    try {
      await insertContextMetrics({
        conversation_id: this.conversationId,
        user_id: this.userId,
        timestamp: new Date(),
        raw_message_count: this.rawMessages.length,
        optimized_message_count: this.optimizedMessages.length,
        turn_count: this.countUserTurns(this.rawMessages),
        tool_trim_count: this.toolTrimCountLastRefresh,
        summary_added: this.summaryAddedLastRefresh,
      });
    } catch (error) {
      console.error("[ContextSession] Failed to record metrics:", error);
    }
  }

  /**
   * Get current metrics without recording.
   */
  getMetrics(): ContextMetricsData {
    return {
      conversationId: this.conversationId,
      userId: this.userId,
      rawMessageCount: this.rawMessages.length,
      optimizedMessageCount: this.optimizedMessages.length,
      turnCount: this.countUserTurns(this.rawMessages),
      toolTrimCount: this.toolTrimCountLastRefresh,
      summaryAdded: this.summaryAddedLastRefresh,
    };
  }

  /**
   * Update metrics with token usage after LLM response.
   */
  async updateUsageMetrics(inputTokens: number, outputTokens: number): Promise<void> {
    if (!this.config.metricsEnabled) return;

    try {
      await insertContextMetrics({
        conversation_id: this.conversationId,
        user_id: this.userId,
        timestamp: new Date(),
        raw_message_count: this.rawMessages.length,
        optimized_message_count: this.optimizedMessages.length,
        turn_count: this.countUserTurns(this.rawMessages),
        tool_trim_count: this.toolTrimCountLastRefresh,
        summary_added: this.summaryAddedLastRefresh,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      });
    } catch (error) {
      console.error("[ContextSession] Failed to update usage metrics:", error);
    }
  }
}
