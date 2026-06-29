import { Test, TestingModule } from '@nestjs/testing';
import { Message } from '@chat/api-interfaces';
import { BotStrategy } from '../interfaces/bot-strategy.interface';
import { SpamBotStrategyService } from './spam.bot-strategy.service';

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'm1',
  senderId: 'u1',
  recipientId: 'bot',
  content: 'hello',
  sentAt: new Date().toISOString(),
  ...overrides,
});

// Reaches the private bound calculation for the dedicated bounds test.
type WithRandomInterval = { getRandomIntervalMs(): number };

describe('SpamBotStrategyService', () => {
  let service: SpamBotStrategyService;

  beforeEach(async () => {
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [SpamBotStrategyService],
    }).compile();

    service = module.get<SpamBotStrategyService>(SpamBotStrategyService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('onInit() emits a phrase after a delay within [10s, 120s]', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0); // delay → MIN (10s)
    const next = jest.fn();
    service.message$?.subscribe(next);

    service.onInit?.();

    jest.advanceTimersByTime(9999);
    expect(next).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].content).toEqual(expect.any(String));
    expect(next.mock.calls[0][0].content.length).toBeGreaterThan(0);
  });

  it('emits with NO recipientId (broadcast intent)', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const next = jest.fn();
    service.message$?.subscribe(next);

    service.onInit?.();
    jest.advanceTimersByTime(10_000);

    expect(next).toHaveBeenCalledWith({ content: expect.any(String) });
    expect(next.mock.calls[0][0]).not.toHaveProperty('recipientId');
  });

  // `defer(() => timer(random)).pipe(repeat())` must pick a *fresh* delay on
  // every cycle. Per cycle Math.random is called twice (delay, then phrase),
  // so the sequence is: delay₁, phrase₁, delay₂, phrase₂, …
  it('re-schedules with a fresh random delay each cycle (emits multiple times)', () => {
    // floor(r * (120000 - 10000 + 1)) + 10000:  r=0 → 10_000, r=0.5 → 65_000.
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0) // delay₁ → 10s
      .mockReturnValueOnce(0) // phrase₁
      .mockReturnValueOnce(0.5) // delay₂ → 65s (proves re-randomization)
      .mockReturnValue(0); // phrase₂ and any later cycles → 10s
    const next = jest.fn();
    service.message$?.subscribe(next);

    service.onInit?.();

    jest.advanceTimersByTime(10_000); // t=10s: cycle 1 fires, cycle 2 armed for +65s
    expect(next).toHaveBeenCalledTimes(1);

    // If the delay were fixed at 10s, cycle 2 would fire again here; it does not,
    // proving cycle 2 was re-randomized to a different (65s) delay.
    jest.advanceTimersByTime(10_000); // t=20s
    expect(next).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(55_000); // t=75s: cycle 2 fires (cycle 3 armed for t=85s)
    expect(next).toHaveBeenCalledTimes(2);
  });

  // Spam does not implement onMessage at all — incoming messages are ignored
  // by absence (BotsService calls it via optional chaining).
  it('onMessage() is a no-op — ignores incoming messages', () => {
    const strategy: BotStrategy = service;
    expect(strategy.onMessage).toBeUndefined();

    const next = jest.fn();
    service.message$?.subscribe(next);

    strategy.onMessage?.(makeMessage({ senderId: 'u1', content: 'hi' }));
    jest.advanceTimersByTime(120_000);

    expect(next).not.toHaveBeenCalled();
  });

  it('stops emitting after onModuleDestroy() — no emissions past teardown', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0); // 10s delay each cycle
    const next = jest.fn();
    service.message$?.subscribe(next);

    service.onInit?.();
    jest.advanceTimersByTime(10_000);
    expect(next).toHaveBeenCalledTimes(1);

    service.onModuleDestroy();

    jest.advanceTimersByTime(1_000_000);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('random delay stays within bounds across many samples', () => {
    const getDelay = () =>
      (service as unknown as WithRandomInterval).getRandomIntervalMs();

    for (let i = 0; i < 1000; i++) {
      const delay = getDelay();
      expect(delay).toBeGreaterThanOrEqual(10_000);
      expect(delay).toBeLessThanOrEqual(120_000);
    }

    // Explicit extremes.
    jest.spyOn(Math, 'random').mockReturnValueOnce(0);
    expect(getDelay()).toBe(10_000);
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.9999999);
    expect(getDelay()).toBe(120_000);
  });
});
