import { Message } from '../models';

export interface MessageSendEvent {
  recipientId: string;
  content: string;
}

export type MessageReceivedEvent = Message;

export const MessageEvents = {
  SEND: 'message:send', // (client → server)
  RECEIVED: 'message:received', // (server → recipient)
} as const;
export type MessageEvents = (typeof MessageEvents)[keyof typeof MessageEvents];
