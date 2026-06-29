import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';
import { Message } from '@chat/api-interfaces';
import { Avatar } from '../avatar/avatar';

/**
 * A run of consecutive messages from one sender: a single avatar plus stacked
 * bubbles. `isOwn` flips alignment (right/accent vs left/grey).
 */
@Component({
  selector: 'app-message-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar],
  templateUrl: './message-group.html',
  styleUrl: './message-group.scss',
  host: {
    '[class.message-group--own]': 'isOwn()',
  },
})
export class MessageGroup {
  public readonly messages = input.required<Message[]>();
  public readonly isOwn = input<boolean>(false);
  public readonly avatarUrl = input<string>('');
}
