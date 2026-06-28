import { Message, UserTypes } from '@chat/api-interfaces';
import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { BotBusEvents, BotReplyEvent } from '../../shared/events/bot.events';
import { MessageBusEvents } from '../../shared/events/message.events';

type ConversationKey = `${string}:${string}`;

@Injectable()
export class MessagesService {
  private readonly conversations: Map<ConversationKey, Message[]> = new Map();

  constructor(private eventEmitter: EventEmitter2, private usersService: UsersService) {}

  private getConversationKey(userIds: [string, string]): ConversationKey {
    return userIds.sort().join(':') as ConversationKey;
  }

  public create(senderId: string, recipientId: string, content: string): Message {
    const conversationKey = this.getConversationKey([senderId, recipientId]);
    const messages = this.conversations.get(conversationKey) ?? [];

    const message: Message = {
      id: crypto.randomUUID(),
      senderId,
      recipientId,
      content,
      sentAt: new Date().toISOString()
    }
    this.conversations.set(conversationKey, [...messages, message]);

    if (this.usersService.get(recipientId)?.type === UserTypes.BOT) {
      this.eventEmitter.emit(BotBusEvents.RECEIVE, message);
    } else {
      this.eventEmitter.emit(MessageBusEvents.DELIVER, message);
    }

    return message;
  }

  public getConversationMessages(currentUserId: string, interlocutorId: string): Message[] {
    const conversationKey = this.getConversationKey([currentUserId, interlocutorId]);
    return this.conversations.get(conversationKey) ?? [];
  }

  @OnEvent(BotBusEvents.REPLY)
  public handleBotReplyEvent({ botId, recipientId, content}: BotReplyEvent): void {
    this.create(botId, recipientId, content);
  }
}
