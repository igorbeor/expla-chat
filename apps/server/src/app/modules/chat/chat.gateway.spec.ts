import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { Socket as ServerSocket } from 'socket.io';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { AddressInfo } from 'net';
import {
  AckResult,
  ConversationEvents,
  ConversationHistoryResponse,
  Message,
  MessageEvents,
  PresenceDisconnectedEvent,
  PresenceEvents,
  PresenceInitEvent,
  PresenceJoinedEvent,
  StatusChangedEvent,
  StatusEvents,
  UserStatuses,
  UserTypes,
} from '@chat/api-interfaces';
import { AppModule } from '../../app.module';
import { ChatGateway } from './chat.gateway';
import { MessageSendDto } from './dto/message-send.dto';
import { StatusChangeDto } from './dto/status-change.dto';
import { BotNames } from '../bots/enums/bot-names.enum';
import { BotTypes } from '../bots/enums/bot-types.enum';

// Integration tests: a live Nest app reached over a real
// socket.io-client. Real timers throughout — the grace window is shrunk via
// GRACE_MS so disconnect/reconnect can be exercised quickly (Jest fake timers
// conflict with live socket.io). Bot timing (Reverse 3s, Spam 10-120s) is left
// to the strategy unit tests; here the bus is exercised end-to-end via Echo
// plus the Spam/Ignore "no reply to incoming" cases.

jest.setTimeout(15000);

const GRACE_MS = 500;
const AVATAR = 'https://example.com/avatar.png';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

type Handshake = { name?: string; avatarUrl?: string; id?: string };

describe('ChatGateway (integration)', () => {
  let app: INestApplication;
  let url: string;
  const clients: ClientSocket[] = [];

  // --- helpers ---------------------------------------------------------------

  const connect = (auth: Handshake): ClientSocket => {
    const client = io(url, {
      auth,
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    clients.push(client);
    return client;
  };

  const waitFor = <T = unknown>(
    client: ClientSocket,
    event: string,
    timeoutMs = 2000,
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timeout waiting for "${event}"`)),
        timeoutMs,
      );
      client.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  const connectAndInit = async (
    auth: Handshake,
  ): Promise<{ client: ClientSocket; init: PresenceInitEvent }> => {
    const client = connect(auth);
    const init = await waitFor<PresenceInitEvent>(client, PresenceEvents.INIT);
    return { client, init };
  };

  // Resolves iff `event` (matching `predicate`) does NOT arrive within the window.
  const expectNoEvent = <T = unknown>(
    client: ClientSocket,
    event: string,
    windowMs = 250,
    predicate: (payload: T) => boolean = () => true,
  ): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const handler = (payload: T) => {
        if (predicate(payload)) {
          clearTimeout(timer);
          client.off(event, handler);
          reject(new Error(`unexpected "${event}"`));
        }
      };
      const timer = setTimeout(() => {
        client.off(event, handler);
        resolve();
      }, windowMs);
      client.on(event, handler);
    });

  // --- lifecycle -------------------------------------------------------------

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      // The gateway reads GRACE_MS from ConfigService; shrink it so the grace
      // window can be exercised quickly with real timers.
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => (key === 'GRACE_MS' ? GRACE_MS : undefined),
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    url = `http://localhost:${address.port}`;
  });

  afterEach(async () => {
    for (const client of clients) {
      client.disconnect();
    }
    clients.length = 0;
    // Let any pending grace-removal timers fire while the server is still up.
    await delay(GRACE_MS + 50);
    await app.close();
  });

  // --- presence --------------------------------------------------------------

  describe('Presence', () => {
    it('new client receives presence:init with selfId and contacts (including bots, excluding self)', async () => {
      const { init } = await connectAndInit({ name: 'Alice', avatarUrl: AVATAR });

      expect(init.selfId).toMatch(UUID_RE);
      expect(init.contacts).toHaveLength(4);
      expect(init.contacts.every((c) => c.user.type === UserTypes.BOT)).toBe(true);
      expect(init.contacts.map((c) => c.user.name).sort()).toEqual(
        Object.values(BotNames).slice().sort(),
      );
      expect(init.contacts.some((c) => c.user.id === init.selfId)).toBe(false);
    });

    it('existing clients receive presence:joined for a newcomer', async () => {
      const { client: observer } = await connectAndInit({
        name: 'Observer',
        avatarUrl: AVATAR,
      });
      const joined = waitFor<PresenceJoinedEvent>(
        observer,
        PresenceEvents.JOINED,
      );

      const { init: newcomer } = await connectAndInit({
        name: 'Newcomer',
        avatarUrl: AVATAR,
      });

      const payload = await joined;
      expect(payload.id).toBe(newcomer.selfId);
      expect(payload.name).toBe('Newcomer');
      expect(payload.type).toBe(UserTypes.USER);
    });

    it('rejects a connection whose handshake lacks name/avatarUrl', async () => {
      const client = connect({ avatarUrl: AVATAR }); // missing name
      const err = await waitFor<Error>(client, 'connect_error');

      expect(err).toBeTruthy();
      expect(client.connected).toBe(false);
    });

    it('disconnect → after GRACE_MS broadcasts presence:disconnected and purges conversations', async () => {
      const { client: observer } = await connectAndInit({
        name: 'Observer',
        avatarUrl: AVATAR,
      });
      const { client: alice, init: aliceInit } = await connectAndInit({
        name: 'Alice',
        avatarUrl: AVATAR,
      });

      // Seed a conversation between the two so we can assert it gets purged.
      await observer.emitWithAck(MessageEvents.SEND, {
        recipientId: aliceInit.selfId,
        content: 'hi',
      });

      const disconnected = waitFor<PresenceDisconnectedEvent>(
        observer,
        PresenceEvents.DISCONNECTED,
      );
      alice.disconnect();

      const payload = await disconnected;
      expect(payload.userId).toBe(aliceInit.selfId);

      const ack = (await observer.emitWithAck(ConversationEvents.HISTORY, {
        interlocutorId: aliceInit.selfId,
        limit: 25,
      })) as AckResult<ConversationHistoryResponse>;
      if (!ack.ok) throw new Error('expected ok ack');
      expect(ack.data.messages).toEqual([]);
    });

    it('reconnect within the grace window cancels removal — NO presence:disconnected, NO duplicate joined', async () => {
      const { client: observer } = await connectAndInit({
        name: 'Observer',
        avatarUrl: AVATAR,
      });
      const firstJoined = waitFor<PresenceJoinedEvent>(
        observer,
        PresenceEvents.JOINED,
      );
      const { client: alice, init: aliceInit } = await connectAndInit({
        name: 'Alice',
        avatarUrl: AVATAR,
      });
      const aliceId = aliceInit.selfId;
      await firstJoined; // consume the legitimate join for Alice

      const noDisconnect = expectNoEvent<PresenceDisconnectedEvent>(
        observer,
        PresenceEvents.DISCONNECTED,
        GRACE_MS + 200,
        (p) => p.userId === aliceId,
      );
      const noDuplicateJoin = expectNoEvent<PresenceJoinedEvent>(
        observer,
        PresenceEvents.JOINED,
        GRACE_MS + 200,
        (p) => p.id === aliceId,
      );

      alice.disconnect();
      const { init: reInit } = await connectAndInit({
        name: 'Alice',
        avatarUrl: AVATAR,
        id: aliceId,
      });
      expect(reInit.selfId).toBe(aliceId);

      await Promise.all([noDisconnect, noDuplicateJoin]);
    });

    it('reconnect restores message routing to the new socket', async () => {
      const { client: sender, init: senderInit } = await connectAndInit({
        name: 'Sender',
        avatarUrl: AVATAR,
      });
      const { client: alice, init: aliceInit } = await connectAndInit({
        name: 'Alice',
        avatarUrl: AVATAR,
      });
      const aliceId = aliceInit.selfId;

      alice.disconnect();
      const { client: alice2 } = await connectAndInit({
        name: 'Alice',
        avatarUrl: AVATAR,
        id: aliceId,
      });

      const received = waitFor<Message>(alice2, MessageEvents.RECEIVED);
      await sender.emitWithAck(MessageEvents.SEND, {
        recipientId: aliceId,
        content: 'after-reconnect',
      });

      const msg = await received;
      expect(msg.content).toBe('after-reconnect');
      expect(msg.recipientId).toBe(aliceId);
      expect(msg.senderId).toBe(senderInit.selfId);
    });

    it('SECURITY: claiming an ACTIVE user id (not in grace window) does NOT hijack — connects as a new user, victim routing intact', async () => {
      const { client: alice, init: aliceInit } = await connectAndInit({
        name: 'Alice',
        avatarUrl: AVATAR,
      });
      const aliceId = aliceInit.selfId;

      // Attacker claims Alice's id while Alice is still active.
      const { client: attacker, init: attackerInit } = await connectAndInit({
        name: 'Mallory',
        avatarUrl: AVATAR,
        id: aliceId,
      });
      expect(attackerInit.selfId).toMatch(UUID_RE);
      expect(attackerInit.selfId).not.toBe(aliceId);

      // A message addressed to aliceId reaches the real Alice, not the attacker.
      const aliceReceived = waitFor<Message>(alice, MessageEvents.RECEIVED);
      const attackerNotReceived = expectNoEvent(
        attacker,
        MessageEvents.RECEIVED,
        300,
      );
      await attacker.emitWithAck(MessageEvents.SEND, {
        recipientId: aliceId,
        content: 'ping',
      });

      const msg = await aliceReceived;
      expect(msg.content).toBe('ping');
      await attackerNotReceived;
    });

    it('a stale/unknown claimed userId falls back to a new server-assigned user', async () => {
      const staleId = crypto.randomUUID();
      const { init } = await connectAndInit({
        name: 'Ghost',
        avatarUrl: AVATAR,
        id: staleId,
      });

      expect(init.selfId).toMatch(UUID_RE);
      expect(init.selfId).not.toBe(staleId);
    });
  });

  // --- messages --------------------------------------------------------------

  describe('Messages', () => {
    it('message:send → sender receives ack with the stored Message (server id + sentAt)', async () => {
      const { client: alice, init: aliceInit } = await connectAndInit({
        name: 'Alice',
        avatarUrl: AVATAR,
      });
      const { init: bobInit } = await connectAndInit({
        name: 'Bob',
        avatarUrl: AVATAR,
      });

      const ack = (await alice.emitWithAck(MessageEvents.SEND, {
        recipientId: bobInit.selfId,
        content: 'hello',
      })) as AckResult<Message>;

      if (!ack.ok) throw new Error('expected ok ack');
      expect(ack.data.id).toMatch(UUID_RE);
      expect(ack.data.senderId).toBe(aliceInit.selfId);
      expect(ack.data.recipientId).toBe(bobInit.selfId);
      expect(ack.data.content).toBe('hello');
      // sentAt is a round-trippable ISO string
      expect(new Date(ack.data.sentAt).toISOString()).toBe(ack.data.sentAt);
    });

    it('message:send → recipient receives message:received', async () => {
      const { client: alice, init: aliceInit } = await connectAndInit({
        name: 'Alice',
        avatarUrl: AVATAR,
      });
      const { client: bob, init: bobInit } = await connectAndInit({
        name: 'Bob',
        avatarUrl: AVATAR,
      });

      const received = waitFor<Message>(bob, MessageEvents.RECEIVED);
      await alice.emitWithAck(MessageEvents.SEND, {
        recipientId: bobInit.selfId,
        content: 'hey bob',
      });

      const msg = await received;
      expect(msg.content).toBe('hey bob');
      expect(msg.senderId).toBe(aliceInit.selfId);
      expect(msg.recipientId).toBe(bobInit.selfId);
    });

    it('message:send without an ack callback does not crash; recipient still receives', async () => {
      const { client: alice } = await connectAndInit({
        name: 'Alice',
        avatarUrl: AVATAR,
      });
      const { client: bob, init: bobInit } = await connectAndInit({
        name: 'Bob',
        avatarUrl: AVATAR,
      });

      const received = waitFor<Message>(bob, MessageEvents.RECEIVED);
      // Emit WITHOUT an ack callback.
      alice.emit(MessageEvents.SEND, {
        recipientId: bobInit.selfId,
        content: 'no-ack',
      });

      const msg = await received;
      expect(msg.content).toBe('no-ack');
    });

    it('TRUST: senderId is derived from the socket; a senderId in the payload is ignored', async () => {
      const { client: alice, init: aliceInit } = await connectAndInit({
        name: 'Alice',
        avatarUrl: AVATAR,
      });
      const { init: bobInit } = await connectAndInit({
        name: 'Bob',
        avatarUrl: AVATAR,
      });

      // Inject a spoofed senderId; whitelist strips it, gateway uses the socket.
      const ack = (await alice.emitWithAck(MessageEvents.SEND, {
        recipientId: bobInit.selfId,
        content: 'spoof',
        senderId: 'attacker-controlled',
      })) as AckResult<Message>;

      if (!ack.ok) throw new Error('expected ok ack');
      expect(ack.data.senderId).toBe(aliceInit.selfId);
      expect(ack.data.senderId).not.toBe('attacker-controlled');
    });

    it('message delivered while recipient is in the grace window is stored but not pushed; appears after reconnect history refetch', async () => {
      const { client: alice, init: aliceInit } = await connectAndInit({
        name: 'Alice',
        avatarUrl: AVATAR,
      });
      const { client: bob, init: bobInit } = await connectAndInit({
        name: 'Bob',
        avatarUrl: AVATAR,
      });
      const bobId = bobInit.selfId;

      bob.disconnect(); // Bob enters the grace window.

      // Stored, but delivered to Bob's now-dead socket (no live push).
      await alice.emitWithAck(MessageEvents.SEND, {
        recipientId: bobId,
        content: 'while-away',
      });

      // Bob reconnects within grace, then refetches history.
      const { client: bob2 } = await connectAndInit({
        name: 'Bob',
        avatarUrl: AVATAR,
        id: bobId,
      });
      const ack = (await bob2.emitWithAck(ConversationEvents.HISTORY, {
        interlocutorId: aliceInit.selfId,
        limit: 25,
      })) as AckResult<ConversationHistoryResponse>;

      if (!ack.ok) throw new Error('expected ok ack');
      expect(ack.data.messages).toHaveLength(1);
      expect(ack.data.messages[0].content).toBe('while-away');
      expect(ack.data.messages[0].senderId).toBe(aliceInit.selfId);
    });
  });

  // --- status ----------------------------------------------------------------

  describe('Status', () => {
    it('status:change → other clients receive status:changed with userId from the socket', async () => {
      const { client: alice, init: aliceInit } = await connectAndInit({
        name: 'Alice',
        avatarUrl: AVATAR,
      });
      const { client: bob } = await connectAndInit({
        name: 'Bob',
        avatarUrl: AVATAR,
      });

      const changed = waitFor<StatusChangedEvent>(bob, StatusEvents.CHANGED);
      const senderNotNotified = expectNoEvent(alice, StatusEvents.CHANGED, 300);
      alice.emit(StatusEvents.CHANGE, { status: UserStatuses.AWAY });

      const payload = await changed;
      expect(payload.userId).toBe(aliceInit.selfId);
      expect(payload.status).toBe(UserStatuses.AWAY);
      await senderNotNotified;
    });
  });

  // --- unbound socket (direct handler invocation) ----------------------------
  // A validly-connected socket is always bound, so these edge cases are driven
  // by calling the gateway methods directly with a socket id absent from the
  // internal maps.
  describe('Unbound socket', () => {
    it('message:send from an unbound socket is dropped (warn), no crash', () => {
      const gateway = app.get(ChatGateway);
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const socket = { id: 'ghost-socket' } as unknown as ServerSocket;
      const dto: MessageSendDto = {
        recipientId: crypto.randomUUID(),
        content: 'x',
      };

      expect(() => gateway.handleMessageSend(dto, socket)).toThrow(WsException);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('status:change from an unbound socket is dropped', () => {
      const gateway = app.get(ChatGateway);
      const broadcastEmit = jest.fn();
      const socket = {
        id: 'ghost-socket',
        broadcast: { emit: broadcastEmit },
      } as unknown as ServerSocket;
      const dto: StatusChangeDto = { status: UserStatuses.AWAY };

      expect(() => gateway.handleStatusChange(dto, socket)).not.toThrow();
      expect(broadcastEmit).not.toHaveBeenCalled();
    });
  });

  // --- bots (end-to-end through the bus) -------------------------------------

  describe('Bots', () => {
    const botId = (init: PresenceInitEvent, type: BotTypes): string => {
      const bot = init.contacts.find((c) => c.user.name === BotNames[type]);
      if (!bot) throw new Error(`bot "${type}" not seeded`);
      return bot.user.id;
    };

    it('message to Echo bot → sender receives the same content back', async () => {
      const { client: alice, init } = await connectAndInit({
        name: 'Alice',
        avatarUrl: AVATAR,
      });
      const echoId = botId(init, BotTypes.ECHO);

      const received = waitFor<Message>(alice, MessageEvents.RECEIVED);
      await alice.emitWithAck(MessageEvents.SEND, {
        recipientId: echoId,
        content: 'echo-me',
      });

      const msg = await received;
      expect(msg.content).toBe('echo-me');
      expect(msg.senderId).toBe(echoId);
      expect(msg.recipientId).toBe(init.selfId);
    });

    it('message to Spam bot → no reply to the incoming message', async () => {
      const { client: alice, init } = await connectAndInit({
        name: 'Alice',
        avatarUrl: AVATAR,
      });
      const spamId = botId(init, BotTypes.SPAM);

      const noReply = expectNoEvent(alice, MessageEvents.RECEIVED, 300);
      await alice.emitWithAck(MessageEvents.SEND, {
        recipientId: spamId,
        content: 'anyone there?',
      });

      await noReply;
    });

    it('message to Ignore bot → no reply at all', async () => {
      const { client: alice, init } = await connectAndInit({
        name: 'Alice',
        avatarUrl: AVATAR,
      });
      const ignoreId = botId(init, BotTypes.IGNORE);

      const noReply = expectNoEvent(alice, MessageEvents.RECEIVED, 300);
      await alice.emitWithAck(MessageEvents.SEND, {
        recipientId: ignoreId,
        content: 'hello?',
      });

      await noReply;
    });
  });
});
