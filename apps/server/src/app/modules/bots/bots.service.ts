import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { BotType } from './enums/bot-types.enum';
import { UsersService } from '../users/users.service';
import { Message, User, UserStatus, UserType } from '@chat/api-interfaces';
import { BotName } from './enums/bot-names.enum';
import { BotEvent, BotReplyEvent } from '../../shared/events/bot.events';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { BotsRegistryService } from './bots.registry.service';
import { Subject, takeUntil } from 'rxjs';

@Injectable()
export class BotsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotsService.name);

  private readonly botTypeById: Map<string, BotType> = new Map();
  private readonly botIdByType: Map<BotType, string> = new Map();

  private readonly destroy$ = new Subject<void>();

  constructor(
    private usersService: UsersService,
    private botsRegistry: BotsRegistryService,
    private eventEmitter: EventEmitter2,
  ) {}

  public onModuleInit() {
    this.createBots();
    this.subscribeBotMessages();
    this.botsRegistry.getAll().forEach((s) => s.onInit?.());
  }

  public onModuleDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private createBots(): void {
    const bots: User[] = Object.values(BotType).map((botType: BotType) => {
      const bot: User = {
        id: crypto.randomUUID(),
        name: BotName[botType],
        avatarUrl: 'https://api.dicebear.com/10.x/bottts/svg',
        status: UserStatus.ONLINE,
        type: UserType.BOT,
      };
      this.botTypeById.set(bot.id, botType);
      this.botIdByType.set(botType, bot.id);
      return bot;
    });
    this.usersService.initBots(bots);
  }

  private subscribeBotMessages(): void {
    for (const strategy of this.botsRegistry.getAll()) {
      const botId = this.botIdByType.get(strategy.type);
      if (botId === undefined) {
        throw new Error(`No bot id registered for type "${strategy.type}"`);
      }
      strategy.message$?.pipe(takeUntil(this.destroy$)).subscribe({
        next: ({ recipientId, content }) =>
          this.dispatchReply(botId, content, recipientId),
      });
    }
  }

  private dispatchReply(
    botId: string,
    content: string,
    recipientId?: string,
  ): void {
    if (recipientId) {
      this.dispatchSingleReply(botId, recipientId, content);
    } else {
      const users = this.usersService
        .getAll()
        .filter(({ type }) => type === UserType.USER);
      this.dispatchMultipleReply(botId, users, content);
    }
  }

  private dispatchSingleReply(
    botId: string,
    recipientId: string,
    content: string,
  ): void {
    const payload: BotReplyEvent = {
      botId,
      recipientId,
      content,
    };
    this.eventEmitter.emit(BotEvent.REPLY, payload);
  }

  private dispatchMultipleReply(
    botId: string,
    users: User[],
    content: string,
  ): void {
    users.forEach((user) => {
      const payload: BotReplyEvent = {
        botId,
        recipientId: user.id,
        content,
      };
      this.eventEmitter.emit(BotEvent.REPLY, payload);
    });
  }

  @OnEvent(BotEvent.RECEIVE)
  handleBotReceiveEvent(message: Message) {
    const botType = this.botTypeById.get(message.recipientId);
    if (botType) {
      this.botsRegistry.get(botType).onMessage?.(message);
    } else {
      this.logger.warn(`No bot type registered for id "${message.recipientId}"`);
    }
  }
}
