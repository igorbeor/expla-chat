import { Message } from '@chat/api-interfaces';
import { BotType } from '../enums/bot-types.enum';
import { Observable } from 'rxjs';
import { BotOutgoing } from './bot-outgoing.interface';

export interface BotStrategy {
  readonly type: BotType;
  readonly message$?: Observable<BotOutgoing>;
  onInit?(): void;
  onMessage?(message: Message): void;
}
