import { Test, TestingModule } from '@nestjs/testing';
import { Message } from '@chat/api-interfaces';
import { BotOutgoing } from '../interfaces/bot-outgoing.interface';
import { ReverseBotStrategyService } from './reverse.bot-strategy.service';

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'm1',
  senderId: 'u1',
  recipientId: 'bot',
  content: 'hello',
  sentAt: new Date().toISOString(),
  ...overrides,
});

describe('ReverseBotStrategyService', () => {
  let service: ReverseBotStrategyService;

  beforeEach(async () => {
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReverseBotStrategyService],
    }).compile();

    service = module.get<ReverseBotStrategyService>(ReverseBotStrategyService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('onMessage() emits the reversed content after exactly 3s', () => {
    const next = jest.fn();
    service.message$?.subscribe(next);

    service.onMessage?.(makeMessage({ senderId: 'u1', content: 'abc' }));

    jest.advanceTimersByTime(2999);
    expect(next).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith({ recipientId: 'u1', content: 'cba' });
  });

  // Key regression: the strategy uses a per-emission `delay`, not a `debounce`.
  // Several messages arriving inside the window must each get an answer.
  it('answers EVERY message when several arrive rapidly (delay, NOT debounce)', () => {
    const next = jest.fn();
    service.message$?.subscribe(next);

    service.onMessage?.(makeMessage({ senderId: 'u1', content: 'a' }));
    service.onMessage?.(makeMessage({ senderId: 'u1', content: 'b' }));
    service.onMessage?.(makeMessage({ senderId: 'u1', content: 'c' }));

    jest.advanceTimersByTime(3000);

    expect(next).toHaveBeenCalledTimes(3);
  });

  it('preserves order of replies', () => {
    const received: string[] = [];
    service.message$?.subscribe((out: BotOutgoing) => received.push(out.content));

    ['ab', 'cd', 'ef'].forEach((content) =>
      service.onMessage?.(makeMessage({ senderId: 'u1', content })),
    );

    jest.advanceTimersByTime(3000);

    expect(received).toEqual(['ba', 'dc', 'fe']);
  });

  it('reverses an empty string to an empty string', () => {
    const next = jest.fn();
    service.message$?.subscribe(next);

    service.onMessage?.(makeMessage({ senderId: 'u1', content: '' }));
    jest.advanceTimersByTime(3000);

    expect(next).toHaveBeenCalledWith({ recipientId: 'u1', content: '' });
  });

  // Reversal is `[...value].reverse()`, i.e. by Unicode code point — so a
  // surrogate pair (😀) survives intact rather than being torn in half the way
  // `split('')` would. This locks in that current behavior.
  it('handles multibyte / emoji content (reverses by code point)', () => {
    const next = jest.fn();
    service.message$?.subscribe(next);

    service.onMessage?.(makeMessage({ senderId: 'u1', content: 'ab😀' }));
    jest.advanceTimersByTime(3000);

    expect(next).toHaveBeenCalledWith({ recipientId: 'u1', content: '😀ba' });
  });
});
