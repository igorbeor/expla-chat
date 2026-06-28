export const BotEvent = {
  RECEIVE: 'bot.receive',
  REPLY: 'bot.reply',
} as const;

export interface BotReplyEvent {
  botId: string;
  recipientId: string;
  content: string;
}
