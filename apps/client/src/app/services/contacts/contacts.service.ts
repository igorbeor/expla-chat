import { computed, Injectable, signal } from '@angular/core';
import { Message, User, UserStatuses } from '@chat/api-interfaces';

export interface ContactWithLastMessage {
  user: User;
  lastMessage: Message | null;
}

@Injectable({
  providedIn: 'root',
})
export class ContactsService {
  private readonly _contacts = signal<User[]>([]);
  private readonly _search = signal<string>('');
  private readonly _filter = signal<'all' | 'online'>('all');
  private readonly _lastMessageByContactId = signal<{ [key: string]: Message }>(
    {},
  );

  public readonly lastMessageByContactId =
    this._lastMessageByContactId.asReadonly();
  /** Full, unfiltered contact list (e.g. to resolve a contact regardless of search/filter). */
  public readonly contacts = this._contacts.asReadonly();
  /** Current search term (reflects the search input). */
  public readonly search = this._search.asReadonly();
  /** Current contact filter (reflects the filter toggle). */
  public readonly filter = this._filter.asReadonly();
  public readonly filteredAndSortedContactsWithLastMessage = computed<
    ContactWithLastMessage[]
  >(() => {
    const search = this._search().trim().toLowerCase();
    const filter = this._filter();
    const contacts = this._contacts();
    return contacts
      .filter((user) => this.filterContacts(user, search, filter))
      .map((user) => ({
        user,
        lastMessage: this._lastMessageByContactId()[user.id] ?? null,
      }))
      .sort((a, b) => this.sortContactsByLastMessage(a, b));
  });

  public set(contacts: User[]): void {
    this._contacts.set([...contacts]);
  }

  public add(contact: User): void {
    this._contacts.update((items) => [...items, contact]);
  }

  public remove(contactId: string): void {
    this._contacts.update((items) =>
      items.filter(({ id }) => id !== contactId),
    );
    this._lastMessageByContactId.update((lastMessageByContactId) => {
      const { [contactId]: _, ...newLastMessageByContactId } =
        lastMessageByContactId;
      return newLastMessageByContactId;
    });
  }

  public updateStatus(contactId: string, status: UserStatuses): void {
    this._contacts.update((items) =>
      items.map((item) => {
        if (item.id === contactId) {
          return { ...item, status };
        }
        return item;
      }),
    );
  }

  public setSearch(search: string): void {
    this._search.set(search);
  }

  public setFilter(filter: 'all' | 'online'): void {
    this._filter.set(filter);
  }

  public updateLastMessageByContactId(
    contactId: string,
    message: Message,
  ): void {
    this._lastMessageByContactId.update((map) => {
      if (map[contactId]?.id === message.id) return map;
      return { ...map, [contactId]: message };
    });
  }

  private filterContacts(
    user: User,
    search: string,
    filter: 'all' | 'online',
  ): boolean {
    if (filter === 'online' && user.status !== UserStatuses.ONLINE)
      return false;
    if (search !== '' && !user.name.toLowerCase().includes(search))
      return false;
    return true;
  }

  private sortContactsByLastMessage(
    contactA: ContactWithLastMessage,
    contactB: ContactWithLastMessage,
  ): number {
    const aTime = contactA.lastMessage
      ? new Date(contactA.lastMessage.sentAt).getTime()
      : null;
    const bTime = contactB.lastMessage
      ? new Date(contactB.lastMessage.sentAt).getTime()
      : null;
    // 1. If both are null/undefined, keep original order
    if (aTime === bTime) return 0;
    // 2. If 'a' is null, push it after valid dates
    if (aTime === null) return 1;
    // 3. If 'b' is null, push it after valid dates
    if (bTime === null) return -1;
    // 4. Sort remaining valid ISO dates descending
    return bTime - aTime;
  }
}
