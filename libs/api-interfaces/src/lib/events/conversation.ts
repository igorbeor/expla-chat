import { Message } from "../models";

export interface ConversationHistoryRequest {
  interlocutorId: string;
  limit: number;
  before?: string; // oldest message id
}

export interface ConversationHistoryResponse {
  messages: Message[];
  hasMore: boolean;
}

export const ConversationEvents = {
  HISTORY: 'conversation:history', // client -> server
} as const;
export type ConversationEvents =
  (typeof ConversationEvents)[keyof typeof ConversationEvents];
