import { Injectable } from '@nestjs/common';
import { BotStrategy } from '../interfaces/bot-strategy.interface';
import { BotType } from '../enums/bot-types.enum';

@Injectable()
export class IgnoreBotStrategyService implements BotStrategy {
  public readonly type = BotType.IGNORE;
}
