import { Test, TestingModule } from '@nestjs/testing';
import { ReverseBotStrategyService } from './reverse.bot-strategy.service';

describe('ReverseBotStrategyService', () => {
  let service: ReverseBotStrategyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReverseBotStrategyService],
    }).compile();

    service = module.get<ReverseBotStrategyService>(ReverseBotStrategyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
