import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  Logger,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  ConversationEvents,
  ConversationHistoryResponse,
  Message,
  MessageEvents,
  PresenceDisconnectedEvent,
  PresenceEvents,
  PresenceInitEvent,
  PresenceJoinedEvent,
  StatusChangedEvent,
  StatusEvents,
  User,
  UserHandshakeAuth,
  UserStatuses,
  UserTypes,
} from '@chat/api-interfaces';
import { UsersService } from '../users/users.service';
import { MessagesService } from '../messages/messages.service';
import { MessageBusEvents } from '../../shared/events/message.events';
import {
  UserBusEvents,
  UserDisconnectedEvent,
} from '../../shared/events/user.events';
import { MessageSendDto } from './dto/message-send.dto';
import { StatusChangeDto } from './dto/status-change.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserHandshakeAuthDto } from './dto/user-handshake-auth.dto';
import { ConversationHistoryDto } from './dto/conversation-history.dto';
import { AckEnvelopeInterceptor } from './interceptors/ack-envelope-interceptor.interceptor';

const GRACE_MS = 10_000;

@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    exceptionFactory: (errors) =>
      new WsException(
        errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; '),
      ),
  }),
)
@WebSocketGateway({
  cors: { origin: 'http://localhost:4200', credentials: true },
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  private readonly socketIdByUserId: Map<string, string> = new Map();
  private readonly userIdBySocketId: Map<string, string> = new Map();
  private readonly pendingRemovals: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private readonly usersService: UsersService,
    private readonly messagesService: MessagesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  public afterInit(server: Server) {
    server.use(async (socket, next) => {
      // handshake must carry name + avatarUrl, otherwise reject the socket.
      const dto = plainToInstance(UserHandshakeAuthDto, socket.handshake.auth);
      const errors = await validate(dto);
      if (errors.length) {
        return next(new Error('Invalid handshake'));
      }
      socket.handshake.auth = { ...dto };
      return next();
    });
  }

  public handleConnection(socket: Socket): void {
    const {
      name,
      avatarUrl,
      id: userId,
    } = socket.handshake.auth as UserHandshakeAuth;

    // RECONNECT: a known userId that still exists within the grace window.
    if (userId && this.pendingRemovals.has(userId)) {
      this.reconnectUser(socket, userId);
      return;
    }

    // NEW USER: handshake carry name + avatarUrl.
    this.connectNewUser(socket, name, avatarUrl);
  }

  public handleDisconnect(socket: Socket): void {
    const userId = this.userIdBySocketId.get(socket.id);
    if (!userId) {
      return;
    }

    // Only remove if this socket is still the one bound to the user. A reconnect
    // could have rebound the user to a fresh socket before this fired.
    if (this.socketIdByUserId.get(userId) !== socket.id) {
      this.userIdBySocketId.delete(socket.id);
      return;
    }

    const timer = setTimeout(() => {
      this.disconnectUser(userId);
    }, GRACE_MS);

    this.pendingRemovals.set(userId, timer);
  }

  @UseInterceptors(AckEnvelopeInterceptor)
  @SubscribeMessage(MessageEvents.SEND)
  public handleMessageSend(
    @MessageBody() dto: MessageSendDto,
    @ConnectedSocket() socket: Socket,
  ): Message {
    const senderId = this.requireUserId(socket);
    return this.messagesService.create(senderId, dto.recipientId, dto.content);
  }

  @SubscribeMessage(StatusEvents.CHANGE)
  public handleStatusChange(
    @MessageBody() dto: StatusChangeDto,
    @ConnectedSocket() socket: Socket,
  ): void {
    const userId = this.userIdBySocketId.get(socket.id);
    if (!userId) {
      return;
    }

    this.usersService.updateStatus(userId, dto.status);

    const payload: StatusChangedEvent = { userId, status: dto.status };
    socket.broadcast.emit(StatusEvents.CHANGED, payload);
  }

  @UseInterceptors(AckEnvelopeInterceptor)
  @SubscribeMessage(ConversationEvents.HISTORY)
  public handleConversationHistory(
    @MessageBody() { interlocutorId, limit, before }: ConversationHistoryDto,
    @ConnectedSocket() socket: Socket,
  ): ConversationHistoryResponse {
    const userId = this.requireUserId(socket);

    return this.messagesService.getConversationPage(
      userId,
      interlocutorId,
      limit,
      before,
    );
  }

  @OnEvent(MessageBusEvents.DELIVER)
  public handleMessageDeliver(message: Message): void {
    const socketId = this.socketIdByUserId.get(message.recipientId);
    if (socketId) {
      this.server.to(socketId).emit(MessageEvents.RECEIVED, message);
    }
  }

  private bindSocket(userId: string, socketId: string): void {
    // Drop any stale reverse-mapping for the user's previous socket.
    const previousSocketId = this.socketIdByUserId.get(userId);
    if (previousSocketId && previousSocketId !== socketId) {
      this.userIdBySocketId.delete(previousSocketId);
    }
    this.socketIdByUserId.set(userId, socketId);
    this.userIdBySocketId.set(socketId, userId);
  }

  private reconnectUser(socket: Socket, userId: string): void {
    const pending = this.pendingRemovals.get(userId);
    if (pending) {
      clearTimeout(pending);
      this.pendingRemovals.delete(userId);
    }

    this.bindSocket(userId, socket.id);

    // Re-emit the current view to the reconnected socket; do NOT broadcast joined.
    const initPayload: PresenceInitEvent = {
      selfId: userId,
      contacts: this.usersService.getAll().filter((u) => u.id !== userId),
    };
    socket.emit(PresenceEvents.INIT, initPayload);
  }

  private connectNewUser(
    socket: Socket,
    name: string,
    avatarUrl: string,
  ): void {
    const user: User = {
      id: crypto.randomUUID(),
      name,
      avatarUrl,
      status: UserStatuses.ONLINE,
      type: UserTypes.USER,
    };

    this.usersService.add(user);
    this.bindSocket(user.id, socket.id);

    const initPayload: PresenceInitEvent = {
      selfId: user.id,
      contacts: this.usersService.getAll().filter((u) => u.id !== user.id),
    };
    socket.emit(PresenceEvents.INIT, initPayload);

    const joinedPayload: PresenceJoinedEvent = user;
    socket.broadcast.emit(PresenceEvents.JOINED, joinedPayload);
  }

  private disconnectUser(userId: string): void {
    this.usersService.remove(userId);

    const payload: PresenceDisconnectedEvent = { userId };
    this.server.emit(PresenceEvents.DISCONNECTED, payload);

    const busPayload: UserDisconnectedEvent = { userId };
    this.eventEmitter.emit(UserBusEvents.DISCONNECTED, busPayload);

    const boundSocketId = this.socketIdByUserId.get(userId);
    if (boundSocketId) {
      this.userIdBySocketId.delete(boundSocketId);
    }
    this.socketIdByUserId.delete(userId);
    this.pendingRemovals.delete(userId);
  }

  private requireUserId(socket: Socket): string {
    const userId = this.userIdBySocketId.get(socket.id);
    if (!userId) {
      this.logger.warn(`Unbound socket ${socket.id}.`);
      throw new WsException('Unbound socket');
    }
    return userId;
  }
}
