import { Test, TestingModule } from '@nestjs/testing';
import { BotsRegistryService } from './bots.registry.service';
import { BotTypes } from './enums/bot-types.enum';
import { BotStrategy } from './interfaces/bot-strategy.interface';
import { EchoBotStrategyService } from './strategies/echo.bot-strategy.service';
import { ReverseBotStrategyService } from './strategies/reverse.bot-strategy.service';
import { IgnoreBotStrategyService } from './strategies/ignore.bot-strategy.service';
import { SpamBotStrategyService } from './strategies/spam.bot-strategy.service';

const makeStrategy = (type: BotTypes): BotStrategy => ({ type });

describe('BotsRegistryService', () => {
  let service: BotsRegistryService;
  let echo: BotStrategy;
  let reverse: BotStrategy;
  let ignore: BotStrategy;
  let spam: BotStrategy;

  beforeEach(async () => {
    echo = makeStrategy(BotTypes.ECHO);
    reverse = makeStrategy(BotTypes.REVERSE);
    ignore = makeStrategy(BotTypes.IGNORE);
    spam = makeStrategy(BotTypes.SPAM);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotsRegistryService,
        { provide: EchoBotStrategyService, useValue: echo },
        { provide: ReverseBotStrategyService, useValue: reverse },
        { provide: IgnoreBotStrategyService, useValue: ignore },
        { provide: SpamBotStrategyService, useValue: spam },
      ],
    }).compile();

    service = module.get<BotsRegistryService>(BotsRegistryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get()', () => {
    it('get(type) returns the matching strategy for each bot type', () => {
      expect(service.get(BotTypes.ECHO)).toBe(echo);
      expect(service.get(BotTypes.REVERSE)).toBe(reverse);
      expect(service.get(BotTypes.IGNORE)).toBe(ignore);
      expect(service.get(BotTypes.SPAM)).toBe(spam);
    });

    it('get(unknownType) throws (invariant violation)', () => {
      expect(() => service.get('nope' as BotTypes)).toThrow(
        'No strategy registered for type "nope"',
      );
    });
  });

  describe('getAll()', () => {
    it('getAll() returns all four strategies', () => {
      expect(service.getAll()).toEqual([echo, reverse, ignore, spam]);
      expect(service.getAll()).toHaveLength(4);
    });
  });
});
