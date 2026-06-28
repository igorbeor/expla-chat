import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { BotTypes } from '../enums/bot-types.enum';
import { BotStrategy } from '../interfaces/bot-strategy.interface';
import { defer, repeat, Subject, takeUntil, timer } from 'rxjs';
import { BotOutgoing } from '../interfaces/bot-outgoing.interface';

const MIN_INTERVAL_MS = 10_000;
const MAX_INTERVAL_MS = 120_000;

@Injectable()
export class SpamBotStrategyService implements BotStrategy, OnModuleDestroy {
  public readonly type = BotTypes.SPAM;

  private readonly _message$ = new Subject<BotOutgoing>();
  public readonly message$ = this._message$.asObservable();

  private readonly destroy$ = new Subject<void>();

  private readonly phrases: string[] = [
    'The quick brown fox jumps over the lazy dog.',
    'A fluffy Shih Tzu is waiting for a walk.',
    'Brewing a fresh cup of specialty coffee.',
    'Deploying a new Angular component to production.',
    "Defending the tower in the executioner's kitchen.",
    'Baking a fresh batch of croutons in the air fryer.',
    'May the force be with you.',
    'With great power comes great responsibility.',
  ];

  private randomInterval$ = defer(() => {
    const randomDelay = this.getRandomIntervalMs();
    return timer(randomDelay);
  }).pipe(repeat());

  onModuleDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onInit() {
    this.randomInterval$
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: () => {
        const content = this.getRandomStaticPhrase();
        this._message$.next({ content })
      } });
  }

  private getRandomStaticPhrase(): string {
    const randomIndex = Math.floor(Math.random() * this.phrases.length);
    return this.phrases[randomIndex];
  }

  private getRandomIntervalMs(minMs = MIN_INTERVAL_MS, maxMs = MAX_INTERVAL_MS): number {
    const randomMs =
      Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;

    return randomMs;
  }
}
