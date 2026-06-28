import { BotType } from "./bot-types.enum";

export const BotName = {
  [BotType.ECHO]: 'Echo Bot',
  [BotType.REVERSE]: 'Reverse Bot',
  [BotType.IGNORE]: 'Ignore Bot',
  [BotType.SPAM]: 'Spam Bot',
} as const;
