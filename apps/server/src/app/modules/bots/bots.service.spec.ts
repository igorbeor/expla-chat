import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Message,
  User,
  UserStatuses,
  UserTypes,
} from '@chat/api-interfaces';
import { Subject } from 'rxjs';
import { BotBusEvents, BotReplyEvent } from '../../shared/events/bot.events';
import { BotsRegistryService } from './bots.registry.service';
import { BotsService } from './bots.service';
import { BotNames } from './enums/bot-names.enum';
import { BotTypes } from './enums/bot-types.enum';
import { BotOutgoing } from './interfaces/bot-outgoing.interface';
import { UsersService } from '../users/users.service';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'u1',
  name: 'Alice',
  avatarUrl: 'https://example.com/a.png',
  status: UserStatuses.ONLINE,
  type: UserTypes.USER,
  ...overrides,
});

const makeMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'm1',
  senderId: 'u1',
  recipientId: 'bot',
  content: 'hello',
  sentAt: new Date().toISOString(),
  ...overrides,
});

// Controllable fake strategy: `subject` drives `message$`; handlers are spies.
const makeStrategy = (type: BotTypes) => {
  const subject = new Subject<BotOutgoing>();
  return {
    type,
    subject,
    message$: subject,
    onMessage: jest.fn(),
    onInit: jest.fn(),
  };
};

type FakeStrategy = ReturnType<typeof makeStrategy>;

describe('BotsService', () => {
  let service: BotsService;
  let usersService: { initBots: jest.Mock; getAll: jest.Mock };
  let eventEmitter: EventEmitter2;
  let replies: BotReplyEvent[];

  let echo: FakeStrategy;
  let reverse: FakeStrategy;
  let spam: FakeStrategy;
  let ignore: FakeStrategy;

  // Bots are seeded with random UUID ids; recover them from the seed call.
  const seededBots = (): User[] =>
    usersService.initBots.mock.calls[0][0] as User[];
  const botIdOf = (type: BotTypes): string =>
    seededBots().find((b) => b.name === BotNames[type])!.id;

  beforeEach(async () => {
    echo = makeStrategy(BotTypes.ECHO);
    reverse = makeStrategy(BotTypes.REVERSE);
    spam = makeStrategy(BotTypes.SPAM);
    ignore = makeStrategy(BotTypes.IGNORE);
    const byType = new Map<BotTypes, FakeStrategy>([
      [BotTypes.ECHO, echo],
      [BotTypes.REVERSE, reverse],
      [BotTypes.SPAM, spam],
      [BotTypes.IGNORE, ignore],
    ]);

    usersService = {
      initBots: jest.fn(),
      getAll: jest.fn().mockReturnValue([]),
    };
    const registry = {
      getAll: jest.fn(() => [echo, reverse, spam, ignore]),
      get: jest.fn((type: BotTypes) => byType.get(type)),
    };

    eventEmitter = new EventEmitter2();
    replies = [];
    eventEmitter.on(BotBusEvents.REPLY, (payload: BotReplyEvent) =>
      replies.push(payload),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotsService,
        { provide: UsersService, useValue: usersService },
        { provide: BotsRegistryService, useValue: registry },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<BotsService>(BotsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit()', () => {
    it('onModuleInit() seeds 4 bots into UsersService (uuid id, names, ONLINE, BOT)', () => {
      service.onModuleInit();

      expect(usersService.initBots).toHaveBeenCalledTimes(1);
      const bots = seededBots();
      expect(bots).toHaveLength(4);
      for (const bot of bots) {
        expect(bot.id).toMatch(UUID_RE);
        expect(bot.status).toBe(UserStatuses.ONLINE);
        expect(bot.type).toBe(UserTypes.BOT);
      }
      expect(bots.map((b) => b.name).sort()).toEqual(
        Object.values(BotNames).slice().sort(),
      );
    });

    it('onModuleInit() subscribes to message$ BEFORE calling onInit() on strategies', () => {
      // A Subject does not replay: this early emission survives only if the
      // subscription was already wired when onInit ran.
      echo.onInit.mockImplementation(() =>
        echo.subject.next({ recipientId: 'h1', content: 'early' }),
      );

      service.onModuleInit();

      expect(replies).toContainEqual({
        botId: botIdOf(BotTypes.ECHO),
        recipientId: 'h1',
        content: 'early',
      });
    });
  });

  describe('handleBotReceiveEvent()', () => {
    it('handleBotReceiveEvent() routes to the correct strategy by recipientId → onMessage', () => {
      service.onModuleInit();
      const message = makeMessage({
        recipientId: botIdOf(BotTypes.ECHO),
        senderId: 'u1',
        content: 'hi',
      });

      service.handleBotReceiveEvent(message);

      expect(echo.onMessage).toHaveBeenCalledWith(message);
      expect(reverse.onMessage).not.toHaveBeenCalled();
      expect(spam.onMessage).not.toHaveBeenCalled();
      expect(ignore.onMessage).not.toHaveBeenCalled();
    });

    it('handleBotReceiveEvent() with an unknown recipientId logs a warning and does not throw', () => {
      service.onModuleInit();
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      expect(() =>
        service.handleBotReceiveEvent(makeMessage({ recipientId: 'ghost' })),
      ).not.toThrow();

      expect(warn).toHaveBeenCalled();
      expect(echo.onMessage).not.toHaveBeenCalled();
    });
  });

  describe('reply dispatch', () => {
    it('bridges a strategy reply (with recipientId) to BotBusEvents.REPLY with the correct botId', () => {
      service.onModuleInit();

      echo.subject.next({ recipientId: 'user1', content: 'pong' });

      expect(replies).toEqual([
        { botId: botIdOf(BotTypes.ECHO), recipientId: 'user1', content: 'pong' },
      ]);
    });

    it('fans out a recipientId-less reply (Spam) to ALL human users', () => {
      const h1 = makeUser({ id: 'h1', type: UserTypes.USER });
      const h2 = makeUser({ id: 'h2', type: UserTypes.USER });
      const b1 = makeUser({ id: 'b1', type: UserTypes.BOT });
      usersService.getAll.mockReturnValue([h1, h2, b1]);
      service.onModuleInit();

      spam.subject.next({ content: 'broadcast' });

      expect(replies).toEqual([
        { botId: botIdOf(BotTypes.SPAM), recipientId: 'h1', content: 'broadcast' },
        { botId: botIdOf(BotTypes.SPAM), recipientId: 'h2', content: 'broadcast' },
      ]);
    });

    it('broadcast fanout excludes bots (does not spam other bots)', () => {
      const h1 = makeUser({ id: 'h1', type: UserTypes.USER });
      const b1 = makeUser({ id: 'b1', type: UserTypes.BOT });
      usersService.getAll.mockReturnValue([h1, b1]);
      service.onModuleInit();

      spam.subject.next({ content: 'broadcast' });

      expect(replies.every((r) => r.recipientId !== 'b1')).toBe(true);
      expect(replies.map((r) => r.recipientId)).toEqual(['h1']);
    });

    it('broadcast fanout with zero human users emits nothing and does not throw', () => {
      usersService.getAll.mockReturnValue([]);
      service.onModuleInit();

      expect(() => spam.subject.next({ content: 'broadcast' })).not.toThrow();
      expect(replies).toEqual([]);
    });
  });

  describe('onModuleDestroy()', () => {
    it('onModuleDestroy() unsubscribes — no replies bridged after teardown', () => {
      service.onModuleInit();
      service.onModuleDestroy();

      echo.subject.next({ recipientId: 'user1', content: 'late' });

      expect(replies).toEqual([]);
    });
  });
});
