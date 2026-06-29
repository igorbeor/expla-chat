import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { Contact, UserStatuses } from '@chat/api-interfaces';
import { Avatar } from '../avatar/avatar';
import { RelativeTimePipe } from '../pipes/relative-time.pipe';

/** A single contact row: avatar, name, last-message preview, relative time. */
@Component({
  selector: 'app-contact-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, RelativeTimePipe],
  templateUrl: './contact-item.html',
  styleUrl: './contact-item.scss',
})
export class ContactItem {
  public readonly contact = input.required<Contact>();
  public readonly currentTime = input.required<Date>();
  public readonly selected = input<boolean>(false);
  public readonly selectContact = output<void>();

  protected readonly UserStatuses = UserStatuses;
}
