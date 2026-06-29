import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { Message } from '@chat/api-interfaces';
import { ContactsService } from '../../services/contacts/contacts.service';
import { ConversationService } from '../../services/conversation/conversation.service';
import { SessionService } from '../../services/session/session.service';
import { ChatHeader } from '../../ui/chat-header/chat-header';
import { MessageGroup } from '../../ui/message-group/message-group';
import { MessageInput } from '../../ui/message-input/message-input';

/** A run of consecutive messages from one sender (for stacked rendering). */
interface MessageRun {
  senderId: string;
  messages: Message[];
}

/** Distance (px) from an edge still considered "at" that edge. */
const EDGE_THRESHOLD = 80;

/** Open conversation: header, grouped message stream, and the composer. */
@Component({
  selector: 'app-chat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChatHeader, MessageGroup, MessageInput],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
})
export class Chat {
  private readonly conversationSvc = inject(ConversationService);
  private readonly contacts = inject(ContactsService);
  private readonly session = inject(SessionService);

  private readonly stream = viewChild<ElementRef<HTMLElement>>('stream');

  protected readonly conversation = this.conversationSvc;
  protected readonly selfId = this.session.currentUserId;

  protected readonly interlocutor = computed(() => {
    const id = this.conversationSvc.interlocutorId();
    if (id === null) return null;
    return this.contacts.contacts().find(({ user }) => user.id === id) ?? null;
  });

  protected readonly groups = computed<MessageRun[]>(() => {
    const runs: MessageRun[] = [];
    for (const message of this.conversationSvc.messages()) {
      const last = runs[runs.length - 1];
      if (last && last.senderId === message.senderId) {
        last.messages.push(message);
      } else {
        runs.push({ senderId: message.senderId, messages: [message] });
      }
    }
    return runs;
  });

  /** Whether to keep the view pinned to the bottom as new content arrives. */
  private stickToBottom = true;
  /** Captured scroll metrics so a prepended page doesn't make the view jump. */
  private prependFromHeight: number | null = null;
  private prependFromTop = 0;

  constructor() {
    // A new conversation: jump to the latest messages.
    effect(() => {
      this.conversationSvc.interlocutorId();
      this.stickToBottom = true;
    });

    // After any message change, adjust scroll once the DOM has updated.
    effect(() => {
      this.conversationSvc.messages();
      requestAnimationFrame(() => this.applyScroll());
    });
  }

  protected avatarFor(senderId: string): string {
    if (senderId === this.selfId()) {
      return this.session.currentUserData()?.avatarUrl ?? '';
    }
    return this.interlocutor()?.user?.avatarUrl ?? '';
  }

  protected onSend(content: string): void {
    void this.conversationSvc.send(content);
  }

  protected onBack(): void {
    this.conversationSvc.closeConversation();
  }

  protected onScroll(): void {
    const el = this.stream()?.nativeElement;
    if (!el) return;

    this.stickToBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < EDGE_THRESHOLD;

    const atTop = el.scrollTop < EDGE_THRESHOLD;
    if (
      atTop &&
      this.prependFromHeight === null &&
      this.conversationSvc.hasMore() &&
      !this.conversationSvc.loading()
    ) {
      this.prependFromHeight = el.scrollHeight;
      this.prependFromTop = el.scrollTop;
      this.conversationSvc.loadMore();
    }
  }

  private applyScroll(): void {
    const el = this.stream()?.nativeElement;
    if (!el) return;

    if (this.prependFromHeight !== null) {
      // Older page prepended: restore the previous viewport position.
      el.scrollTop =
        el.scrollHeight - this.prependFromHeight + this.prependFromTop;
      this.prependFromHeight = null;
      return;
    }

    if (this.stickToBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }
}
