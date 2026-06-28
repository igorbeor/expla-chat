import { Message } from '@chat/api-interfaces';
import { BotTypes } from '../enums/bot-types.enum';
import { Observable } from 'rxjs';
import { BotOutgoing } from './bot-outgoing.interface';

export interface BotStrategy {
  readonly type: BotTypes;
  readonly message$?: Observable<BotOutgoing>;
  onInit?(): void;
  onMessage?(message: Message): void;
}
