/**
 * Title generation for conversations.
 * Uses a small, fast model to generate descriptive titles.
 */

import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { TITLE_GENERATION_PROMPT } from "./prompts";

/**
 * Generate a title for a conversation based on the first exchange.
 * 
 * @param userMessage - The user's first message
 * @param assistantResponse - The assistant's first response (can be partial)
 * @returns Generated title (max 50 chars) or null if generation fails
 */
export async function generateConversationTitle(
  userMessage: string,
  assistantResponse: string
): Promise<string | null> {
  try {
    // Truncate inputs to avoid excessive token usage
    const truncatedUser = userMessage.slice(0, 500);
    const truncatedAssistant = assistantResponse.slice(0, 500);

    const result = await generateText({
      model: openai("gpt-4o-mini"),
      system: TITLE_GENERATION_PROMPT,
      prompt: `User message: ${truncatedUser}\n\nAssistant response: ${truncatedAssistant}`,
      maxOutputTokens: 30,
    });

    const title = result.text.trim();
    
    // Ensure title is not empty and within limits
    if (!title || title.length === 0) {
      return null;
    }

    // Truncate to 50 chars if needed
    return title.slice(0, 50);
  } catch (error) {
    console.error("[title] Failed to generate title:", error);
    return null;
  }
}
