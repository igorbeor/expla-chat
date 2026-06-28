export const BotTypes = {
  ECHO: 'echo',
  REVERSE: 'reverse',
  SPAM: 'spam',
  IGNORE: 'ignore'
} as const
export type BotTypes = typeof BotTypes[keyof typeof BotTypes]