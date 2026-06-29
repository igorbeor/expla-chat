import { Message } from './message';
import { User } from './user';

export interface Contact {
  user: User;
  lastMessage: Message | null;
}
