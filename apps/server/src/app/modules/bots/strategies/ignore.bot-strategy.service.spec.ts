import { Test, TestingModule } from '@nestjs/testing';
import { BotTypes } from '../enums/bot-types.enum';
import { BotStrategy } from '../interfaces/bot-strategy.interface';
import { IgnoreBotStrategyService } from './ignore.bot-strategy.service';

describe('IgnoreBotStrategyService', () => {
  let service: IgnoreBotStrategyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IgnoreBotStrategyService],
    }).compile();

    service = module.get<IgnoreBotStrategyService>(IgnoreBotStrategyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // The strategy is inert by construction: it implements neither an
  // outgoing stream nor any handlers, so there is nothing that could ever emit.
  it('never emits — has no message$ stream and ignores messages', () => {
    // Viewed through the BotStrategy contract, every optional capability is absent.
    const strategy: BotStrategy = service;
    expect(strategy.type).toBe(BotTypes.IGNORE);
    expect(strategy.message$).toBeUndefined();
    expect(strategy.onMessage).toBeUndefined();
    expect(strategy.onInit).toBeUndefined();
  });
});
