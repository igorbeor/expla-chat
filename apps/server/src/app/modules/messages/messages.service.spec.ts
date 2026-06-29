import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { Message, User, UserStatuses, UserTypes } from '@chat/api-interfaces';
import { BotBusEvents } from '../../shared/events/bot.events';
import { MessageBusEvents } from '../../shared/events/message.events';
import { UsersService } from '../users/users.service';
import { MessagesService } from './messages.service';

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

describe('MessagesService', () => {
  let service: MessagesService;
  let eventEmitter: { emit: jest.Mock };
  let usersService: { get: jest.Mock };

  beforeEach(async () => {
    eventEmitter = { emit: jest.fn() };
    usersService = { get: jest.fn() };
    // Recipients exist by default; bot / human / unknown tests override per-case.
    usersService.get.mockReturnValue(makeUser());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
  });

  // Seeds `count` messages a→b in arrival order (m1, m2, ...) and returns them.
  const seedMessages = (count: number): Message[] =>
    Array.from({ length: count }, (_, i) => service.create('a', 'b', `m${i + 1}`));

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create()', () => {
    it('create() assigns a uuid id and an ISO sentAt, returns the Message', () => {
      const message = service.create('a', 'b', 'hello');

      expect(message.id).toMatch(UUID_RE);
      expect(message.sentAt).toEqual(expect.any(String));
      expect(new Date(message.sentAt).toISOString()).toBe(message.sentAt);
      expect(message).toMatchObject({
        senderId: 'a',
        recipientId: 'b',
        content: 'hello',
      });
    });

    it('create() uses a canonical conversation key — A→B and B→A land in the same conversation', () => {
      service.create('a', 'b', 'from a');
      service.create('b', 'a', 'from b');

      const fromAB = service.getConversationPage('a', 'b', 10);
      const fromBA = service.getConversationPage('b', 'a', 10);

      expect(fromAB.messages).toHaveLength(2);
      expect(fromAB).toEqual(fromBA);
      expect(fromAB.messages.map((m) => m.content)).toEqual([
        'from b',
        'from a',
      ]);
    });

    // Plan title says "chronological order"; the service actually returns
    // newest → oldest (see getConversationPage doc comment), so we assert that.
    it('create() appends in arrival order; getConversationPage() returns them newest → oldest', () => {
      const [m1, m2, m3] = seedMessages(3);

      const page = service.getConversationPage('a', 'b', 10);

      expect(page.messages).toEqual([m3, m2, m1]);
    });

    it('create() stores the message BEFORE emitting', () => {
      let messagesAtEmitTime: Message[] = [];
      eventEmitter.emit.mockImplementation(() => {
        messagesAtEmitTime = service.getConversationPage('a', 'b', 10).messages;
        return true;
      });

      const message = service.create('a', 'b', 'hi');

      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(messagesAtEmitTime).toContainEqual(message);
    });

    it('create() emits MessageBusEvents.DELIVER when recipient is a human', () => {
      usersService.get.mockReturnValue(makeUser({ type: UserTypes.USER }));

      const message = service.create('a', 'b', 'hi');

      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        MessageBusEvents.DELIVER,
        message,
      );
    });

    it('create() emits BotBusEvents.RECEIVE (not DELIVER) when recipient is a bot', () => {
      usersService.get.mockReturnValue(makeUser({ type: UserTypes.BOT }));

      const message = service.create('a', 'bot', 'hi');

      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        BotBusEvents.RECEIVE,
        message,
      );
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        MessageBusEvents.DELIVER,
        expect.anything(),
      );
    });

    it('create() throws when the recipient is unknown, storing and emitting nothing', () => {
      usersService.get.mockReturnValue(undefined);

      expect(() => service.create('a', 'ghost', 'hi')).toThrow(
        'Recipient not found',
      );
      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(service.getConversationPage('a', 'ghost', 10)).toEqual({
        messages: [],
        hasMore: false,
      });
    });
  });

  describe('getConversationPage()', () => {
    it('getConversationPage() returns [] for a pair with no history', () => {
      expect(service.getConversationPage('x', 'y', 10)).toEqual({
        messages: [],
        hasMore: false,
      });
    });

    it('returns the last `limit` messages when no cursor is given', () => {
      const [, , , m4, m5] = seedMessages(5);

      const page = service.getConversationPage('a', 'b', 2);

      expect(page.messages).toEqual([m5, m4]);
      expect(page.hasMore).toBe(true);
    });

    it('returns `limit` messages strictly older than the cursor id', () => {
      const [, m2, m3, m4] = seedMessages(5);

      const page = service.getConversationPage('a', 'b', 2, m4.id);

      expect(page.messages).toEqual([m3, m2]);
      expect(page.messages.map((m) => m.id)).not.toContain(m4.id);
    });

    // Plan title says "oldest → newest"; the service returns newest → oldest.
    it('returns messages newest → oldest (descending by time)', () => {
      const [m1, m2, m3] = seedMessages(3);

      const page = service.getConversationPage('a', 'b', 10);

      expect(page.messages).toEqual([m3, m2, m1]);
    });

    it('sets hasMore=true when older messages remain, false otherwise', () => {
      seedMessages(3);

      expect(service.getConversationPage('a', 'b', 2).hasMore).toBe(true);
      expect(service.getConversationPage('a', 'b', 3).hasMore).toBe(false);
      expect(service.getConversationPage('a', 'b', 10).hasMore).toBe(false);
    });

    // Limit clamping is enforced by the ConversationHistoryRequest DTO, not the
    // service — covered by the DTO validation suite, not here.
    it.todo('clamps limit to the server max (DTO responsibility, not the service)');

    it('returns { messages: [], hasMore: false } when the cursor id is not found', () => {
      seedMessages(3);

      expect(service.getConversationPage('a', 'b', 10, 'missing-id')).toEqual({
        messages: [],
        hasMore: false,
      });
    });

    it('returns [] for an empty conversation', () => {
      expect(service.getConversationPage('a', 'b', 10)).toEqual({
        messages: [],
        hasMore: false,
      });
    });
  });

  describe('handleBotReplyEvent()', () => {
    it('handleBotReplyEvent() creates a message from bot to user and delivers it', () => {
      usersService.get.mockReturnValue(makeUser({ id: 'user1', type: UserTypes.USER }));

      service.handleBotReplyEvent({
        botId: 'bot1',
        recipientId: 'user1',
        content: 'beep',
      });

      const page = service.getConversationPage('bot1', 'user1', 10);
      expect(page.messages).toHaveLength(1);
      expect(page.messages[0]).toMatchObject({
        senderId: 'bot1',
        recipientId: 'user1',
        content: 'beep',
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        MessageBusEvents.DELIVER,
        page.messages[0],
      );
    });

    it('bot reply (recipient = human) does NOT re-trigger BotBusEvents.RECEIVE — no bot→bot loop', () => {
      usersService.get.mockReturnValue(makeUser({ id: 'user1', type: UserTypes.USER }));

      service.handleBotReplyEvent({
        botId: 'bot1',
        recipientId: 'user1',
        content: 'beep',
      });

      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        BotBusEvents.RECEIVE,
        expect.anything(),
      );
    });
  });

  describe('handleUserDisconnectedEvent() / purgeConversations', () => {
    it('purgeConversations() removes every conversation containing the userId', () => {
      service.create('a', 'b', 'ab');
      service.create('a', 'c', 'ac');

      service.handleUserDisconnectedEvent({ userId: 'a' });

      expect(service.getConversationPage('a', 'b', 10).messages).toEqual([]);
      expect(service.getConversationPage('a', 'c', 10).messages).toEqual([]);
    });

    it('purgeConversations() leaves conversations not involving the userId intact', () => {
      service.create('a', 'b', 'ab');
      const cd = service.create('c', 'd', 'cd');

      service.handleUserDisconnectedEvent({ userId: 'a' });

      expect(service.getConversationPage('a', 'b', 10).messages).toEqual([]);
      expect(service.getConversationPage('c', 'd', 10).messages).toEqual([cd]);
    });
  });
});
