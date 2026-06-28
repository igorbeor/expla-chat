import { Injectable } from '@nestjs/common';
import { BotStrategy } from './interfaces/bot-strategy.interface';
import { BotType } from './enums/bot-types.enum';
import { EchoBotStrategyService } from './strategies/echo.bot-strategy.service';
import { ReverseBotStrategyService } from './strategies/reverse.bot-strategy.service';
import { IgnoreBotStrategyService } from './strategies/ignore.bot-strategy.service';
import { SpamBotStrategyService } from './strategies/spam.bot-strategy.service';

@Injectable()
export class BotsRegistryService {
  private readonly strategies: Map<BotType, BotStrategy> = new Map();

  constructor(
    private echoBot: EchoBotStrategyService,
    private reverseBot: ReverseBotStrategyService,
    private ignoreBot: IgnoreBotStrategyService,
    private spamBot: SpamBotStrategyService,
  ) {
    this.strategies.set(BotType.ECHO, this.echoBot);
    this.strategies.set(BotType.REVERSE, this.reverseBot);
    this.strategies.set(BotType.IGNORE, this.ignoreBot);
    this.strategies.set(BotType.SPAM, this.spamBot);
  }

  public get(type: BotType): BotStrategy {
    const strategy = this.strategies.get(type);
    if (!strategy) {
      throw new Error(`No strategy registered for type "${type}"`);
    }
    return strategy;
  }

  public getAll(): BotStrategy[] {
    return [...this.strategies.values()];
  }
}
