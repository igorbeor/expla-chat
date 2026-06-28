import { Test, TestingModule } from '@nestjs/testing';
import { SpamBotStrategyService } from './spam.bot-strategy.service';

describe('SpamBotStrategyService', () => {
  let service: SpamBotStrategyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SpamBotStrategyService],
    }).compile();

    service = module.get<SpamBotStrategyService>(SpamBotStrategyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
