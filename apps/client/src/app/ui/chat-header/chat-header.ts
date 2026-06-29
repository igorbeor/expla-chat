import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { User, UserStatuses } from '@chat/api-interfaces';
import { Avatar } from '../avatar/avatar';

/** Header of the open conversation. The back arrow is mobile-only (see SCSS). */
@Component({
  selector: 'app-chat-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar],
  templateUrl: './chat-header.html',
  styleUrl: './chat-header.scss',
})
export class ChatHeader {
  public readonly contact = input.required<User>();
  public readonly back = output<void>();

  protected readonly isOnline = computed(
    () => this.contact().status === UserStatuses.ONLINE,
  );
  protected readonly statusLabel = computed(() =>
    this.isOnline() ? 'Online' : 'Away',
  );
}
