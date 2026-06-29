import { Test, TestingModule } from '@nestjs/testing';
import { Message } from '@chat/api-interfaces';
import { EchoBotStrategyService } from './echo.bot-strategy.service';

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'm1',
  senderId: 'u1',
  recipientId: 'bot',
  content: 'hello',
  sentAt: new Date().toISOString(),
  ...overrides,
});

describe('EchoBotStrategyService', () => {
  let service: EchoBotStrategyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EchoBotStrategyService],
    }).compile();

    service = module.get<EchoBotStrategyService>(EchoBotStrategyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('onMessage() emits to message$ with the same content, recipientId = senderId', () => {
    const next = jest.fn();
    service.message$?.subscribe(next);

    service.onMessage?.(makeMessage({ senderId: 'u1', content: 'hi' }));

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith({ recipientId: 'u1', content: 'hi' });
  });
});
