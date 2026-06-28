export const BotType = {
  ECHO: 'echo',
  REVERSE: 'reverse',
  SPAM: 'spam',
  IGNORE: 'ignore'
} as const
export type BotType = typeof BotType[keyof typeof BotType]