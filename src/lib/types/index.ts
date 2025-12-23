import { ObjectId } from "mongodb";

// ============================================================================
// User Types
// ============================================================================

export interface User {
  id: number;
  email: string;
  password_hash: string | null;
  password_salt: string | null;
  user_type: string | null;
  in_free_trial: boolean;
  created_at: Date;
  last_login: Date | null;
}

export interface UserPublic {
  id: number;
  email: string;
  user_type: string | null;
}

// ============================================================================
// Conversation Types
// ============================================================================

export interface Conversation {
  _id: ObjectId;
  user_id: number;
  title: string;
  first_message_preview: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ConversationWithId extends Omit<Conversation, "_id"> {
  id: string;
}

// ============================================================================
// Message Types
// ============================================================================

export interface ToolEvent {
  type: "tool_call" | "tool_result";
  tool: string;
  args?: Record<string, unknown>;
  result?: unknown;
  tool_call_id?: string;
}

export interface MessageContent {
  type: "text" | "tool_result";
  text?: string;
  result?: unknown;
}

export interface Message {
  _id: ObjectId;
  conversation_id: string;
  user_id: number;
  role: "user" | "assistant" | "system" | "tool";
  content: MessageContent[] | string;
  tool_events?: ToolEvent[];
  people?: Profile[];
  created_at: Date;
}

export interface MessageWithId extends Omit<Message, "_id"> {
  id: string;
}

// ============================================================================
// Profile Types
// ============================================================================

export interface Profile {
  user_id: number;
  screen_name: string;
  name: string;
  profile_image_url?: string;
  headline?: string;
  location?: string;
  bio?: string;
  trending_score?: number;
  followed_by_count?: number;
  stealth_status?: "in" | "out" | null;
  recent_bio_change?: boolean;
  sectors?: string[];
  stages?: string[];
  companies?: string[];
  investors?: string[];
}

// ============================================================================
// Signal Types
// ============================================================================

export interface Signal {
  id: number;
  user_id: number;
  signal_type: string;
  signal_date: Date;
  details?: Record<string, unknown>;
}

// ============================================================================
// Context Metrics Types
// ============================================================================

export interface ContextMetrics {
  _id?: ObjectId;
  conversation_id: string;
  user_id: number;
  timestamp: Date;
  raw_message_count: number;
  optimized_message_count: number;
  turn_count: number;
  tool_trim_count: number;
  summary_added: boolean;
  input_tokens?: number;
  output_tokens?: number;
}
