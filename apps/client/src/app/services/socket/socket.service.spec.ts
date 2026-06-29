import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserHandshakeAuth } from '@chat/api-interfaces';

// --- Mock socket.io-client -------------------------------------------------
// A fake socket that records listeners and lets tests trigger events.
const ioMock = vi.fn();

vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => ioMock(...args),
}));

import { SocketService, ConnectionStatus } from './socket.service';
import { APP_CONFIG } from '../../../environments/app-config.token';

interface FakeSocket {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  timeout: ReturnType<typeof vi.fn>;
  emitWithAck: ReturnType<typeof vi.fn>;
  io: { on: ReturnType<typeof vi.fn> };
  // test helpers
  trigger: (event: string, ...args: unknown[]) => void;
  triggerManager: (event: string, ...args: unknown[]) => void;
  listeners: Map<string, Array<(...a: unknown[]) => void>>;
  managerListeners: Map<string, Array<(...a: unknown[]) => void>>;
}

function createFakeSocket(): FakeSocket {
  const listeners = new Map<string, Array<(...a: unknown[]) => void>>();
  const managerListeners = new Map<string, Array<(...a: unknown[]) => void>>();

  const fake: FakeSocket = {
    listeners,
    managerListeners,
    on: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
      const arr = listeners.get(event) ?? [];
      arr.push(cb);
      listeners.set(event, arr);
      return fake;
    }),
    off: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
      const arr = listeners.get(event) ?? [];
      listeners.set(
        event,
        arr.filter((fn) => fn !== cb),
      );
      return fake;
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    emitWithAck: vi.fn(),
    timeout: vi.fn(() => fake),
    io: {
      on: vi.fn((event: string, cb: (...a: unknown[]) => void) => {
        const arr = managerListeners.get(event) ?? [];
        arr.push(cb);
        managerListeners.set(event, arr);
      }),
    },
    trigger: (event: string, ...args: unknown[]) => {
      (listeners.get(event) ?? []).forEach((fn) => fn(...args));
    },
    triggerManager: (event: string, ...args: unknown[]) => {
      (managerListeners.get(event) ?? []).forEach((fn) => fn(...args));
    },
  };

  return fake;
}

const AUTH = (): UserHandshakeAuth => ({
  name: 'Ada',
  avatarUrl: 'https://example.com/ada.png',
});

describe('SocketService', () => {
  let service: SocketService;
  let fakeSocket: FakeSocket;

  beforeEach(() => {
    fakeSocket = createFakeSocket();
    ioMock.mockReset();
    ioMock.mockReturnValue(fakeSocket);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: APP_CONFIG,
          useValue: { production: false, socketUrl: 'http://test-host:9999' },
        },
      ],
    });
    service = TestBed.inject(SocketService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // 1. connect() calls io() with URL + auth + reconnection options.
  it('connect() calls io() with the configured URL and passes auth + reconnection options', () => {
    service.connect(AUTH);

    expect(ioMock).toHaveBeenCalledTimes(1);
    const [url, opts] = ioMock.mock.calls[0];
    expect(url).toBe('http://test-host:9999');
    expect(opts).toMatchObject({ autoConnect: true });
    expect(opts.reconnectionAttempts).toBeGreaterThan(0);
    expect(opts.reconnectionDelay).toBeGreaterThan(0);

    const cb = vi.fn();
    opts.auth(cb);
    expect(cb).toHaveBeenCalledWith(AUTH());
  });

  // 2. status lifecycle.
  it('status starts disconnected, then connecting, connected, reconnecting, disconnected', () => {
    expect(service.status()).toBe<ConnectionStatus>('disconnected');

    service.connect(AUTH);
    expect(service.status()).toBe<ConnectionStatus>('connecting');

    fakeSocket.trigger('connect');
    expect(service.status()).toBe<ConnectionStatus>('connected');

    fakeSocket.triggerManager('reconnect_attempt', 1);
    expect(service.status()).toBe<ConnectionStatus>('reconnecting');

    fakeSocket.trigger('disconnect', 'transport close');
    expect(service.status()).toBe<ConnectionStatus>('disconnected');
  });

  // 3. on(event) emits payloads in order.
  it('on(event) emits the payload when the socket receives that event, in order', () => {
    service.connect(AUTH);

    const received: number[] = [];
    service.on<number>('tick').subscribe((v) => received.push(v));
    // `on()` sources the socket via `toObservable`, which propagates the signal
    // through an effect; flush it so the underlying socket listener attaches.
    TestBed.tick();

    fakeSocket.trigger('tick', 1);
    fakeSocket.trigger('tick', 2);
    fakeSocket.trigger('tick', 3);

    expect(received).toEqual([1, 2, 3]);
  });

  // 4. Unsubscribing removes the underlying socket listener.
  it('unsubscribing from on(event) removes the underlying socket listener', () => {
    service.connect(AUTH);

    const sub = service.on<number>('tick').subscribe();
    // Flush the `toObservable` effect so the socket listener is attached.
    TestBed.tick();
    expect(fakeSocket.listeners.get('tick')?.length).toBe(1);

    sub.unsubscribe();
    expect(fakeSocket.off).toHaveBeenCalledWith('tick', expect.any(Function));
    expect(fakeSocket.listeners.get('tick')?.length).toBe(0);
  });

  // 5. emit() forwards to socket.emit.
  it('emit(event, payload) forwards to socket.emit with the same args', () => {
    service.connect(AUTH);

    const payload = { recipientId: 'u1', content: 'hi' };
    service.emit('message:send', payload);

    expect(fakeSocket.emit).toHaveBeenCalledWith('message:send', payload);
  });

  // 6. emitWithAck resolves with server AckResult on success.
  it('emitWithAck resolves with the server AckResult on success', async () => {
    service.connect(AUTH);

    const ack = { ok: true, data: { id: 'm1' } };
    fakeSocket.emitWithAck.mockResolvedValue(ack);

    const result = await service.emitWithAck('message:send', { content: 'hi' });

    expect(fakeSocket.timeout).toHaveBeenCalled();
    expect(fakeSocket.emitWithAck).toHaveBeenCalledWith('message:send', {
      content: 'hi',
    });
    expect(result).toEqual(ack);
  });

  // 7. emitWithAck resolves with { ok:false, error } on timeout (no reject/hang).
  it('emitWithAck resolves with { ok: false, error } on timeout', async () => {
    service.connect(AUTH);

    fakeSocket.emitWithAck.mockRejectedValue(
      new Error('operation has timed out'),
    );

    const result = await service.emitWithAck('message:send', { content: 'hi' });

    expect(result).toEqual({ ok: false, error: 'operation has timed out' });
  });

  // 8. disconnect() tears down the socket.
  it('disconnect() tears down the socket and sets status disconnected', () => {
    service.connect(AUTH);
    fakeSocket.trigger('connect');
    expect(service.status()).toBe<ConnectionStatus>('connected');

    service.disconnect();

    expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(service.status()).toBe<ConnectionStatus>('disconnected');
  });
});
