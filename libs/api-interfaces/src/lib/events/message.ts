import { Message } from '../models';

export interface MessageSendEvent {
  recipientId: string;
  content: string;
  clientMsgId: string;
}

export interface MessageAckEvent {
  clientMsgId: string;
  message: Message;
}

export type MessageReceivedEvent = Message;

export const MessageEvents = {
  SEND: 'message:send', // (client → server)
  ACK: 'message:ack', // (server → sender)
  RECEIVED: 'message:received', // (server → recipient)
} as const;
export type MessageEvents = (typeof MessageEvents)[keyof typeof MessageEvents];
