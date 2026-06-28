import { Injectable } from '@nestjs/common';
import { BotStrategy } from '../interfaces/bot-strategy.interface';
import { BotTypes } from '../enums/bot-types.enum';
import { Message } from '@chat/api-interfaces';
import { Subject } from 'rxjs';
import { BotOutgoing } from '../interfaces/bot-outgoing.interface';

@Injectable()
export class EchoBotStrategyService implements BotStrategy {
  public readonly type = BotTypes.ECHO;
  
  private readonly _message$ = new Subject<BotOutgoing>();
  public readonly message$ = this._message$.asObservable();

  public onMessage({ senderId, content }: Message): void {
    this._message$.next({ recipientId: senderId, content });
  }
}
