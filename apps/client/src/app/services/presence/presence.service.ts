import { effect, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  MessageEvents,
  PresenceEvents,
  StatusEvents,
  UserStatuses,
  type StatusChangeEvent,
  type MessageReceivedEvent,
  type PresenceDisconnectedEvent,
  type PresenceInitEvent,
  type PresenceJoinedEvent,
  type StatusChangedEvent,
} from '@chat/api-interfaces';
import { ContactsService } from '../contacts/contacts.service';
import { ConversationService } from '../conversation/conversation.service';
import { SessionService } from '../session/session.service';
import { SocketService } from '../socket/socket.service';
import { fromEvent, merge, map, distinctUntilChanged, debounceTime } from 'rxjs';

/**
 * Real-time orchestration: the glue between the transport (SocketService) and
 * the contact-list/session state. It owns NO state itself — every handler pushes
 * into an existing service:
 *
 *  - presence:init        -> set own id + seed the contact list
 *  - presence:joined      -> add a contact
 *  - presence:disconnected-> remove a contact
 *  - status:changed       -> update a contact's online/away status
 *  - message:received     -> refresh that contact's last-message preview
 *
 * Plus an effect that mirrors the open conversation's newest message into the
 * preview (covers messages we send and inbound messages while the chat is open).
 *
 * Instantiate via {@link init} AFTER `SocketService.connect()` so the listeners
 * are attached before the server emits `presence:init`.
 */
@Injectable({ providedIn: 'root' })
export class PresenceService {
  private readonly socket = inject(SocketService);
  private readonly session = inject(SessionService);
  private readonly contacts = inject(ContactsService);
  private readonly conversation = inject(ConversationService);

  constructor() {
    this.wireVisibility();
    this.socket
      .on<PresenceInitEvent>(PresenceEvents.INIT)
      .pipe(takeUntilDestroyed())
      .subscribe(({ selfId, contacts }) => {
        this.session.setCurrentUserId(selfId);
        this.contacts.set(contacts);
      });

    this.socket
      .on<PresenceJoinedEvent>(PresenceEvents.JOINED)
      .pipe(takeUntilDestroyed())
      .subscribe((user) => this.contacts.add(user));

    this.socket
      .on<PresenceDisconnectedEvent>(PresenceEvents.DISCONNECTED)
      .pipe(takeUntilDestroyed())
      .subscribe(({ userId }) => this.contacts.remove(userId));

    this.socket
      .on<StatusChangedEvent>(StatusEvents.CHANGED)
      .pipe(takeUntilDestroyed())
      .subscribe(({ userId, status }) =>
        this.contacts.updateStatus(userId, status),
      );

    // Inbound previews for any contact (including chats that aren't open).
    this.socket
      .on<MessageReceivedEvent>(MessageEvents.RECEIVED)
      .pipe(takeUntilDestroyed())
      .subscribe((message) =>
        this.contacts.updateLastMessageByContactId(message.senderId, message),
      );

    // Open-conversation previews: newest message (sent or received) -> list.
    effect(() => {
      const id = this.conversation.interlocutorId();
      const messages = this.conversation.messages();
      if (id !== null && messages.length > 0) {
        this.contacts.updateLastMessageByContactId(
          id,
          messages[messages.length - 1],
        );
      }
    });
  }

  private wireVisibility(): void {
    const computeStatus = (): UserStatuses =>
      document.visibilityState === 'visible' && document.hasFocus()
        ? UserStatuses.ONLINE
        : UserStatuses.AWAY;

    merge(
      fromEvent(document, 'visibilitychange'),
      fromEvent(window, 'focus'),
      fromEvent(window, 'blur'),
    )
      .pipe(
        map(() => computeStatus()),
        distinctUntilChanged(),
        debounceTime(300),                       
        takeUntilDestroyed(),
      )
      .subscribe((status) => {
        const payload: StatusChangeEvent = { status };
        this.socket.emit(StatusEvents.CHANGE, payload);
      });
  }

  /** No-op; exists to force eager instantiation from the app initializer. */
  public init(): void {
    /* wiring happens in the constructor */
  }
}
