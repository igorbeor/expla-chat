export const BotEvents = {
  Receive: 'bot.receive',
  Reply: 'bot.reply',
} as const;

export interface BotReplyEvent {
  botId: string;
  recipientId: string;
  content: string;
}
