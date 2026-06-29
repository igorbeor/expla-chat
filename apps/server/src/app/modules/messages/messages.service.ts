import {
  ConversationHistoryResponse,
  Message,
  UserTypes,
} from '@chat/api-interfaces';
import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { BotBusEvents, BotReplyEvent } from '../../shared/events/bot.events';
import { MessageBusEvents } from '../../shared/events/message.events';
import {
  UserBusEvents,
  UserDisconnectedEvent,
} from '../../shared/events/user.events';

type ConversationKey = `${string}:${string}`;

@Injectable()
export class MessagesService {
  private readonly conversations: Map<ConversationKey, Message[]> = new Map();

  constructor(
    private eventEmitter: EventEmitter2,
    private usersService: UsersService,
  ) {}

  private getConversationKey(userIds: [string, string]): ConversationKey {
    return userIds.sort().join(':') as ConversationKey;
  }

  public create(
    senderId: string,
    recipientId: string,
    content: string,
  ): Message {
    const recipient = this.usersService.get(recipientId);
    if (!recipient) {
      throw new Error('Recipient not found');
    }

    const conversationKey = this.getConversationKey([senderId, recipientId]);
    const messages = this.conversations.get(conversationKey) ?? [];

    const message: Message = {
      id: crypto.randomUUID(),
      senderId,
      recipientId,
      content,
      sentAt: new Date().toISOString(),
    };
    // add new message to the end of conversation messages
    this.conversations.set(conversationKey, [...messages, message]);

    if (recipient.type === UserTypes.BOT) {
      this.eventEmitter.emit(BotBusEvents.RECEIVE, message);
    } else {
      this.eventEmitter.emit(MessageBusEvents.DELIVER, message);
    }

    return message;
  }

  /**
   * Returns a single page of the conversation between two users, ordered
   * **newest → oldest** (descending by time).
   *
   * Cursor-based pagination by message id:
   * - without `before` → the latest `limit` messages;
   * - with `before` → up to `limit` messages immediately **older** than the
   *   message with that id (the cursor message itself is excluded).
   *
   * The conversation key is canonical (derived from both ids), so a caller can
   * only ever read their own conversation with `interlocutorId`.
   *
   * @param currentUserId - Id of the requesting user (resolved from the socket, never the payload).
   * @param interlocutorId - Id of the other participant (human or bot).
   * @param limit - Max number of messages to return (validated/clamped by the DTO).
   * @param before - Id of the oldest already-loaded message (the last item of the
   *                 previous page); omit to fetch the first page.
   * @returns `{ messages, hasMore }` — `messages` newest → oldest; `hasMore` is
   *          `true` when older messages remain. Returns `{ messages: [], hasMore: false }`
   *          when the conversation does not exist or `before` is not found.
   */
  public getConversationPage(
    currentUserId: string,
    interlocutorId: string,
    limit: number,
    before?: string,
  ): ConversationHistoryResponse {
    const conversationKey = this.getConversationKey([
      currentUserId,
      interlocutorId,
    ]);
    const conversationMessages = this.conversations.get(conversationKey);
    // Conversation does not exist yet. Return an empty array
    if (conversationMessages === undefined) {
      return { messages: [], hasMore: false };
    }

    const endIndex = before
      ? conversationMessages.findIndex(({ id }) => id === before)
      : conversationMessages.length;
    // Before-id not found in array (deprecated/foreign). Return empty array
    if (endIndex === -1) {
      return { messages: [], hasMore: false };
    }

    const startIndex = Math.max(endIndex - limit, 0);
    return {
      messages: conversationMessages.slice(startIndex, endIndex).reverse(),
      hasMore: startIndex > 0,
    };
  }

  public getLastMessageFromConversation(
    currentUserId: string,
    interlocutorId: string,
  ): Message | null {
    const conversationKey = this.getConversationKey([
      currentUserId,
      interlocutorId,
    ]);
    const conversationMessages = this.conversations.get(conversationKey);
    // Conversation does not exist yet. Return null
    if (conversationMessages === undefined) {
      return null;
    }

    return conversationMessages[conversationMessages.length - 1];
  }

  @OnEvent(BotBusEvents.REPLY)
  public handleBotReplyEvent({
    botId,
    recipientId,
    content,
  }: BotReplyEvent): void {
    this.create(botId, recipientId, content);
  }

  @OnEvent(UserBusEvents.DISCONNECTED)
  public handleUserDisconnectedEvent({ userId }: UserDisconnectedEvent): void {
    this.purgeConversations(userId);
  }

  private purgeConversations(userId: string): void {
    for (const key of this.conversations.keys()) {
      const [a, b] = key.split(':');
      if (a === userId || b === userId) {
        this.conversations.delete(key);
      }
    }
  }
}
