import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AckResult,
  ConversationHistoryResponse,
  Message,
} from '@chat/api-interfaces';
import { ConversationEvents, MessageEvents } from '@chat/api-interfaces';
import { ConversationService } from './conversation.service';
import { SocketService } from '../socket/socket.service';
import { SessionService } from '../session/session.service';

const SELF_ID = 'self-1';

/**
 * Builds a server `Message`. The server sends history pages newest→oldest, so
 * tests construct pages in that order and assert the service stores them
 * ascending.
 */
function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    senderId: overrides.senderId ?? 'other-1',
    recipientId: overrides.recipientId ?? SELF_ID,
    content: overrides.content ?? 'hello',
    sentAt: overrides.sentAt ?? new Date().toISOString(),
  };
}

describe('ConversationService', () => {
  let service: ConversationService;
  let emitWithAck: ReturnType<typeof vi.fn>;
  let received$: Subject<Message>;
  let socketStub: Pick<SocketService, 'emitWithAck' | 'on'>;
  let sessionStub: Pick<SessionService, 'currentUserId'>;

  beforeEach(() => {
    emitWithAck = vi.fn();
    received$ = new Subject<Message>();

    socketStub = {
      emitWithAck: emitWithAck as unknown as SocketService['emitWithAck'],
      on: vi.fn((event: string) => {
        if (event === MessageEvents.RECEIVED) {
          return received$.asObservable();
        }
        return new Subject<unknown>().asObservable();
      }) as SocketService['on'],
    };

    sessionStub = {
      currentUserId: signal<string | null>(SELF_ID).asReadonly(),
    };

    TestBed.configureTestingModule({
      providers: [
        ConversationService,
        { provide: SocketService, useValue: socketStub },
        { provide: SessionService, useValue: sessionStub },
      ],
    });

    service = TestBed.inject(ConversationService);
  });

  function ok<T>(data: T): AckResult<T> {
    return { ok: true, data };
  }

  // 1
  it('openConversation requests HISTORY and overwrites messages ascending + sets hasMore', async () => {
    // server page: newest → oldest
    const newest = makeMessage({ id: 'm3', content: 'newest' });
    const middle = makeMessage({ id: 'm2', content: 'middle' });
    const oldest = makeMessage({ id: 'm1', content: 'oldest' });
    const page: ConversationHistoryResponse = {
      messages: [newest, middle, oldest],
      hasMore: true,
    };
    emitWithAck.mockResolvedValueOnce(ok(page));

    service.openConversation('other-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(emitWithAck).toHaveBeenCalledWith(
      ConversationEvents.HISTORY,
      expect.objectContaining({ interlocutorId: 'other-1' }),
    );
    const req = emitWithAck.mock.calls[0][1];
    expect(typeof req.limit).toBe('number');
    expect(req.limit).toBeGreaterThan(0);

    expect(service.interlocutorId()).toBe('other-1');
    expect(service.messages().map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(service.hasMore()).toBe(true);
  });

  // 8 (ordering)
  it('reverses a newest→oldest page into oldest→newest order', async () => {
    const page: ConversationHistoryResponse = {
      messages: [
        makeMessage({ id: 'c' }),
        makeMessage({ id: 'b' }),
        makeMessage({ id: 'a' }),
      ],
      hasMore: false,
    };
    emitWithAck.mockResolvedValueOnce(ok(page));

    service.openConversation('other-1');
    await Promise.resolve();
    await Promise.resolve();

    expect(service.messages().map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(service.hasMore()).toBe(false);
  });

  // 2 (race guard)
  it('discards a late history response for a previous interlocutor', async () => {
    const pageA: ConversationHistoryResponse = {
      messages: [makeMessage({ id: 'a1', senderId: 'A' })],
      hasMore: false,
    };
    const pageB: ConversationHistoryResponse = {
      messages: [makeMessage({ id: 'b1', senderId: 'B' })],
      hasMore: false,
    };

    let resolveA!: (v: AckResult<ConversationHistoryResponse>) => void;
    const aPromise = new Promise<AckResult<ConversationHistoryResponse>>(
      (res) => (resolveA = res),
    );
    emitWithAck.mockReturnValueOnce(aPromise); // A pending
    emitWithAck.mockResolvedValueOnce(ok(pageB)); // B resolves first

    service.openConversation('A');
    service.openConversation('B');
    await Promise.resolve();
    await Promise.resolve();

    // B has settled
    expect(service.interlocutorId()).toBe('B');
    expect(service.messages().map((m) => m.id)).toEqual(['b1']);

    // Now A resolves late — must be ignored.
    resolveA(ok(pageA));
    await aPromise;
    await Promise.resolve();

    expect(service.messages().map((m) => m.id)).toEqual(['b1']);
  });

  // 3 (loadMore)
  it('loadMore requests with before=oldest id, prepends older page, updates hasMore', async () => {
    const firstPage: ConversationHistoryResponse = {
      messages: [makeMessage({ id: 'm2' }), makeMessage({ id: 'm1' })], // newest→oldest
      hasMore: true,
    };
    emitWithAck.mockResolvedValueOnce(ok(firstPage));
    service.openConversation('other-1');
    await Promise.resolve();
    await Promise.resolve();
    expect(service.messages().map((m) => m.id)).toEqual(['m1', 'm2']);

    const olderPage: ConversationHistoryResponse = {
      messages: [makeMessage({ id: 'm0' }), makeMessage({ id: 'm-1' })], // newest→oldest
      hasMore: false,
    };
    emitWithAck.mockResolvedValueOnce(ok(olderPage));

    service.loadMore();
    await Promise.resolve();
    await Promise.resolve();

    expect(emitWithAck).toHaveBeenLastCalledWith(
      ConversationEvents.HISTORY,
      expect.objectContaining({ interlocutorId: 'other-1', before: 'm1' }),
    );
    expect(service.messages().map((m) => m.id)).toEqual([
      'm-1',
      'm0',
      'm1',
      'm2',
    ]);
    expect(service.hasMore()).toBe(false);
  });

  it('loadMore is a no-op when hasMore is false', async () => {
    const page: ConversationHistoryResponse = {
      messages: [makeMessage({ id: 'm1' })],
      hasMore: false,
    };
    emitWithAck.mockResolvedValueOnce(ok(page));
    service.openConversation('other-1');
    await Promise.resolve();
    await Promise.resolve();
    emitWithAck.mockClear();

    service.loadMore();
    await Promise.resolve();

    expect(emitWithAck).not.toHaveBeenCalled();
  });

  // 4 (send optimistic + reconcile)
  it('send appends optimistic message then replaces it with the server message on ack', async () => {
    const page: ConversationHistoryResponse = { messages: [], hasMore: false };
    emitWithAck.mockResolvedValueOnce(ok(page));
    service.openConversation('other-1');
    await Promise.resolve();
    await Promise.resolve();

    let resolveSend!: (v: AckResult<Message>) => void;
    const sendAck = new Promise<AckResult<Message>>(
      (res) => (resolveSend = res),
    );
    emitWithAck.mockReturnValueOnce(sendAck);

    const sendPromise = service.send('hi there');

    // optimistic message present immediately (synchronously)
    expect(service.messages().length).toBe(1);
    const optimistic = service.messages()[0];
    expect(optimistic.senderId).toBe(SELF_ID);
    expect(optimistic.recipientId).toBe('other-1');
    expect(optimistic.content).toBe('hi there');
    const tempId = optimistic.id;

    expect(emitWithAck).toHaveBeenLastCalledWith(
      MessageEvents.SEND,
      expect.objectContaining({ recipientId: 'other-1', content: 'hi there' }),
    );

    const serverMsg = makeMessage({
      id: 'server-id-1',
      senderId: SELF_ID,
      recipientId: 'other-1',
      content: 'hi there',
    });
    resolveSend(ok(serverMsg));
    await sendPromise;

    expect(service.messages().length).toBe(1);
    expect(service.messages()[0].id).toBe('server-id-1');
    expect(service.messages()[0].id).not.toBe(tempId);
  });

  // 5 (send ack failure)
  it('send removes the optimistic message on ack failure', async () => {
    const page: ConversationHistoryResponse = { messages: [], hasMore: false };
    emitWithAck.mockResolvedValueOnce(ok(page));
    service.openConversation('other-1');
    await Promise.resolve();
    await Promise.resolve();

    emitWithAck.mockResolvedValueOnce({ ok: false, error: 'nope' });

    const sendPromise = service.send('will fail');
    expect(service.messages().length).toBe(1);

    await sendPromise;
    expect(service.messages().length).toBe(0);
  });

  // 6 (send guards)
  it('send is a no-op for empty/whitespace content', async () => {
    const page: ConversationHistoryResponse = { messages: [], hasMore: false };
    emitWithAck.mockResolvedValueOnce(ok(page));
    service.openConversation('other-1');
    await Promise.resolve();
    await Promise.resolve();
    emitWithAck.mockClear();

    await service.send('   ');

    expect(emitWithAck).not.toHaveBeenCalled();
    expect(service.messages().length).toBe(0);
  });

  it('send is a no-op when no interlocutor is selected', async () => {
    await service.send('hello');
    expect(emitWithAck).not.toHaveBeenCalled();
    expect(service.messages().length).toBe(0);
  });

  // 7 (incoming)
  it('appends a RECEIVED message from the current interlocutor', async () => {
    const page: ConversationHistoryResponse = { messages: [], hasMore: false };
    emitWithAck.mockResolvedValueOnce(ok(page));
    service.openConversation('other-1');
    await Promise.resolve();
    await Promise.resolve();

    received$.next(
      makeMessage({ id: 'in-1', senderId: 'other-1', content: 'incoming' }),
    );

    expect(service.messages().map((m) => m.id)).toEqual(['in-1']);
  });

  it('ignores a RECEIVED message from a different sender', async () => {
    const page: ConversationHistoryResponse = { messages: [], hasMore: false };
    emitWithAck.mockResolvedValueOnce(ok(page));
    service.openConversation('other-1');
    await Promise.resolve();
    await Promise.resolve();

    received$.next(makeMessage({ id: 'x', senderId: 'someone-else' }));

    expect(service.messages().length).toBe(0);
  });
});
