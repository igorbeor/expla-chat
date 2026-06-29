import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ContactsService } from '../../services/contacts/contacts.service';
import { ConversationService } from '../../services/conversation/conversation.service';
import { Search } from '../../ui/search/search';
import { ContactItem } from '../../ui/contact-item/contact-item';
import {
  ContactFilter,
  FilterToggle,
} from '../../ui/filter-toggle/filter-toggle';

/** Contacts pane: title, search, the contact list, and the all/online filter. */
@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Search, ContactItem, FilterToggle],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class Sidebar {
  private readonly contacts = inject(ContactsService);
  private readonly conversation = inject(ConversationService);

  protected readonly list =
    this.contacts.filteredAndSortedContactsWithLastMessage;
  protected readonly search = this.contacts.search;
  protected readonly filter = this.contacts.filter;
  protected readonly selectedId = this.conversation.interlocutorId;

  protected onSearch(value: string): void {
    this.contacts.setSearch(value);
  }

  protected onFilter(value: ContactFilter): void {
    this.contacts.setFilter(value);
  }

  protected onSelect(userId: string): void {
    this.conversation.openConversation(userId);
  }
}
