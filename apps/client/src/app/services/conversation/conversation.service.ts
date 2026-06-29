import { inject, Injectable, signal, type Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ConversationEvents,
  MessageEvents,
  type ConversationHistoryRequest,
  type ConversationHistoryResponse,
  type Message,
  type MessageSendRequest,
} from '@chat/api-interfaces';
import { SessionService } from '../session/session.service';
import { SocketService } from '../socket/socket.service';

/** How many messages a single history page requests. */
const HISTORY_PAGE_LIMIT = 30;

/**
 * Holds the state of the ONE currently-open conversation. Messages are stored
 * ascending (oldest -> newest) so templates render top -> bottom naturally; the
 * server returns each history page newest -> oldest, so every page is reversed
 * before being merged.
 *
 * Single-conversation model: only messages belonging to the open conversation
 * are tracked. Own sent messages are not echoed by the server, so no dedup is
 * needed for inbound messages.
 */
@Injectable({ providedIn: 'root' })
export class ConversationService {
  private readonly socket = inject(SocketService);
  private readonly session = inject(SessionService);

  private readonly _interlocutorId = signal<string | null>(null);
  private readonly _messages = signal<Message[]>([]);
  private readonly _hasMore = signal<boolean>(false);
  private readonly _loading = signal<boolean>(false);

  /** The selected contact (shared selection). */
  public readonly interlocutorId: Signal<string | null> =
    this._interlocutorId.asReadonly();
  /** Messages stored ascending (oldest -> newest). */
  public readonly messages: Signal<Message[]> = this._messages.asReadonly();
  /** Whether older messages remain (scroll-up). */
  public readonly hasMore: Signal<boolean> = this._hasMore.asReadonly();
  /** Whether a history page is in flight. */
  public readonly loading: Signal<boolean> = this._loading.asReadonly();

  constructor() {
    // Inbound messages for the open conversation. Subscribed in the injection
    // context so `takeUntilDestroyed` ties the subscription to this service's
    // lifetime.
    this.socket
      .on<Message>(MessageEvents.RECEIVED)
      .pipe(takeUntilDestroyed())
      .subscribe((message) => this.onReceived(message));
  }

  /**
   * Select `interlocutorId` and load the first (latest) page, OVERWRITING any
   * existing messages.
   */
  public openConversation(interlocutorId: string): void {
    this._interlocutorId.set(interlocutorId);
    this._messages.set([]);
    this._hasMore.set(false);
    void this.requestHistory(interlocutorId, undefined);
  }

  /**
   * Load an older page and PREPEND it. No-op when there are no more pages or no
   * messages have been loaded yet.
   */
  public loadMore(): void {
    if (!this._hasMore()) return;

    const current = this._messages();
    if (current.length === 0) return;

    const interlocutorId = this._interlocutorId();
    if (interlocutorId === null) return;

    // Stored ascending, so the FIRST element is the oldest loaded message.
    const before = current[0].id;
    void this.requestHistory(interlocutorId, before);
  }

  /**
   * Optimistically append a message, then reconcile with the server ack:
   * - ok  -> replace the optimistic message (matched by temp id) with the
   *         server message (real id / sentAt).
   * - !ok -> remove the optimistic message and log. Keeping a "failed" marker
   *         would need extra UI state; for this single-conversation model we
   *         drop it so the input can simply be retried.
   *
   * No-op when content is empty/whitespace or no interlocutor is selected.
   */
  public async send(content: string): Promise<void> {
    const trimmed = content.trim();
    if (trimmed.length === 0) return;

    const recipientId = this._interlocutorId();
    if (recipientId === null) return;

    const tempId = crypto.randomUUID();
    const optimistic: Message = {
      id: tempId,
      senderId: this.session.currentUserId() ?? '',
      recipientId,
      content: trimmed,
      sentAt: new Date().toISOString(),
    };
    this._messages.update((messages) => [...messages, optimistic]);

    const request: MessageSendRequest = { recipientId, content: trimmed };
    const result = await this.socket.emitWithAck<Message>(
      MessageEvents.SEND,
      request,
    );

    if (result.ok) {
      const server = result.data;
      this._messages.update((messages) =>
        messages.map((m) => (m.id === tempId ? server : m)),
      );
    } else {
      console.error('Failed to send message:', result.error);
      this._messages.update((messages) =>
        messages.filter((m) => m.id !== tempId),
      );
    }
  }

  private onReceived(message: Message): void {
    if (message.senderId !== this._interlocutorId()) return;
    this._messages.update((messages) => [...messages, message]);
  }

  /**
   * Request a history page and merge it. `before === undefined` means the
   * latest page (overwrite); otherwise an older page (prepend).
   *
   * Race guard: a switch always changes `interlocutorId`, so a late response
   * for a previous interlocutor is discarded by comparing the requested id
   * against the current one after the await.
   */
  private async requestHistory(
    interlocutorId: string,
    before: string | undefined,
  ): Promise<void> {
    this._loading.set(true);

    const request: ConversationHistoryRequest = {
      interlocutorId,
      limit: HISTORY_PAGE_LIMIT,
      ...(before !== undefined ? { before } : {}),
    };

    const result = await this.socket.emitWithAck<ConversationHistoryResponse>(
      ConversationEvents.HISTORY,
      request,
    );

    // Discard stale responses for a conversation the user has since left.
    if (this._interlocutorId() !== interlocutorId) return;

    this._loading.set(false);

    if (!result.ok) {
      console.error('Failed to load conversation history:', result.error);
      if (before === undefined) {
        this._messages.set([]);
        this._hasMore.set(false);
      }
      return;
    }

    // Server pages are newest -> oldest; store ascending.
    const ascending = [...result.data.messages].reverse();

    if (before === undefined) {
      this._messages.set(ascending);
    } else {
      this._messages.update((existing) => [...ascending, ...existing]);
    }
    this._hasMore.set(result.data.hasMore);
  }
}
