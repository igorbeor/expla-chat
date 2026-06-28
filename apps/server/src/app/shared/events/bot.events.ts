export const BotBusEvents = {
  RECEIVE: 'bot.receive',
  REPLY: 'bot.reply',
} as const;
export type BotBusEvents = (typeof BotBusEvents)[keyof typeof BotBusEvents];

export interface BotReplyEvent {
  botId: string;
  recipientId: string;
  content: string;
}
