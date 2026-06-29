import { Injectable } from '@nestjs/common';
import { BotTypes } from '../enums/bot-types.enum';
import { BotStrategy } from '../interfaces/bot-strategy.interface';
import { Message } from '@chat/api-interfaces';
import { Subject, delay } from 'rxjs';
import { BotOutgoing } from '../interfaces/bot-outgoing.interface';

@Injectable()
export class ReverseBotStrategyService implements BotStrategy {
  public readonly type = BotTypes.REVERSE;
  private readonly delay = 3000;

  private readonly _message$ = new Subject<BotOutgoing>();
  public readonly message$ = this._message$.pipe(delay(this.delay));

  public onMessage({ senderId, content }: Message): void {
    const messageContent = this.getReverseString(content);
    this._message$.next({ recipientId: senderId, content: messageContent });
  }

  private getReverseString(value: string): string {
    return [...value].reverse().join('');
  }
}
