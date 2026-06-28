import { BotTypes } from "./bot-types.enum";

export const BotNames = {
  [BotTypes.ECHO]: 'Echo Bot',
  [BotTypes.REVERSE]: 'Reverse Bot',
  [BotTypes.IGNORE]: 'Ignore Bot',
  [BotTypes.SPAM]: 'Spam Bot',
} as const;
