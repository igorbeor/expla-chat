import {
  Injectable,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import { Observable } from 'rxjs';
import { io, type Socket } from 'socket.io-client';
import type { AckResult, UserHandshakeAuth } from '@chat/api-interfaces';
import { APP_CONFIG } from '../../../environments/app-config.token';

/**
 * Connection lifecycle state, derived from socket.io lifecycle events.
 */
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';


const DEFAULT_RECONNECTION_ATTEMPTS = 5;
const DEFAULT_RECONNECTION_DELAY = 1000;
const DEFAULT_ACK_TIMEOUT_MS = 5000;

/**
 * Thin, typed wrapper over `socket.io-client`. TRANSPORT ONLY: it holds no
 * domain state, reads no storage, and contains no business logic. Callers pass
 * the handshake `auth` into {@link connect}.
 */
@Injectable({ providedIn: 'root' })
export class SocketService {
  private readonly appConfig = inject(APP_CONFIG);

  private socket: Socket | null = null;

  private readonly _status = signal<ConnectionStatus>('disconnected');

  public readonly status: Signal<ConnectionStatus> =
    this._status.asReadonly();

  /**
   * Creates the socket and connects. On auto-reconnect, socket.io re-sends the
   * same `auth`, which is how the backend rebinds the session within its grace
   * window.
   */
  public connect(authProvider: () => UserHandshakeAuth): void {
    // Tear down any previous socket before reconnecting with new auth.
    this.disconnect();

    this._status.set('connecting');

    const socket = io(this.appConfig.socketUrl, {
      auth: (cb) => cb(authProvider()),
      reconnectionAttempts: DEFAULT_RECONNECTION_ATTEMPTS,
      reconnectionDelay: DEFAULT_RECONNECTION_DELAY,
      autoConnect: true,
    });

    this.socket = socket;

    socket.on('connect', () => this._status.set('connected'));
    socket.on('disconnect', () => this._status.set('disconnected'));
    // Reconnection events live on the underlying Manager, not the Socket.
    socket.io.on('reconnect_attempt', () => this._status.set('reconnecting'));
  }

  /** Tears down the socket; no automatic reconnection afterwards. */
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this._status.set('disconnected');
  }

  /**
   * Returns an Observable that emits the payload each time the socket receives
   * `event`. The underlying socket listener is removed on unsubscribe.
   */
  public on<T>(event: string): Observable<T> {
    return new Observable<T>((subscriber) => {
      const socket = this.socket;
      if (!socket) {
        subscriber.complete();
        return;
      }

      const handler = (payload: T): void => subscriber.next(payload);
      socket.on(event, handler);

      return () => {
        socket.off(event, handler);
      };
    });
  }

  /** Forwards to `socket.emit`. No-op if not connected. */
  public emit<T>(event: string, payload: T): void {
    this.socket?.emit(event, payload);
  }

  /**
   * Wraps the Socket.io ack with a timeout. The server returns an
   * {@link AckResult} envelope, resolved as-is on success. On timeout or any
   * error, resolves with `{ ok: false, error }` — never rejects or hangs.
   */
  public async emitWithAck<T>(
    event: string,
    payload: unknown,
    timeoutMs: number = DEFAULT_ACK_TIMEOUT_MS,
  ): Promise<AckResult<T>> {
    const socket = this.socket;
    if (!socket) {
      return { ok: false, error: 'Socket is not connected' };
    }

    try {
      const result = (await socket
        .timeout(timeoutMs)
        .emitWithAck(event, payload)) as AckResult<T>;
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }
}
