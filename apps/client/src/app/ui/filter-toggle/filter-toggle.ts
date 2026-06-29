import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

export type ContactFilter = 'all' | 'online';

/** Segmented control: show all contacts or only online ones. */
@Component({
  selector: 'app-filter-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './filter-toggle.html',
  styleUrl: './filter-toggle.scss',
})
export class FilterToggle {
  public readonly filter = input<ContactFilter>('all');
  public readonly filterChange = output<ContactFilter>();
}
