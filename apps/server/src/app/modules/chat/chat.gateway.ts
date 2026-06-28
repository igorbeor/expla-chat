import {
  Ack,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
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

const GRACE_MS = 10_000;

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
      socket.handshake.auth = {...dto};
      return errors.length ? next(new Error('Invalid handshake')) : next();
    });
  }

  public handleConnection(client: Socket): void {
    const {
      name,
      avatarUrl,
      id: userId,
    } = client.handshake.auth as UserHandshakeAuth;

    // RECONNECT: a known userId that still exists within the grace window.
    if (userId && this.pendingRemovals.has(userId)) {
      this.reconnectUser(client, userId);
      return;
    }

    // NEW USER: handshake carry name + avatarUrl.
    this.connectNewUser(client, name, avatarUrl);
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

  @SubscribeMessage(MessageEvents.SEND)
  public handleMessageSend(
    @MessageBody() dto: MessageSendDto,
    @ConnectedSocket() socket: Socket,
    @Ack() ack?: (message: Message) => void,
  ): void {
    const senderId = this.userIdBySocketId.get(socket.id);
    if (!senderId) {
      this.logger.warn(
        `Dropping ${MessageEvents.SEND} from unbound socket ${socket.id}.`,
      );
      return;
    }

    const message = this.messagesService.create(
      senderId,
      dto.recipientId,
      dto.content,
    );
    ack?.(message);
  }

  @SubscribeMessage(StatusEvents.CHANGE)
  public handleStatusChange(
    @MessageBody() dto: StatusChangeDto,
    @ConnectedSocket() socket: Socket,
  ): void {
    const userId = this.userIdBySocketId.get(socket.id);
    if (!userId) {
      this.logger.warn(
        `Dropping ${StatusEvents.CHANGE} from unbound socket ${socket.id}.`,
      );
      return;
    }

    this.usersService.updateStatus(userId, dto.status);

    const payload: StatusChangedEvent = { userId, status: dto.status };
    socket.broadcast.emit(StatusEvents.CHANGED, payload);
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

  private reconnectUser(client: Socket, userId: string): void {
    const pending = this.pendingRemovals.get(userId);
    if (pending) {
      clearTimeout(pending);
      this.pendingRemovals.delete(userId);
    }

    this.bindSocket(userId, client.id);

    // Re-emit the current view to the reconnected socket; do NOT broadcast joined.
    const initPayload: PresenceInitEvent = {
      selfId: userId,
      contacts: this.usersService.getAll().filter((u) => u.id !== userId),
    };
    client.emit(PresenceEvents.INIT, initPayload);
  }

  private connectNewUser(
    client: Socket,
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
    this.bindSocket(user.id, client.id);

    const initPayload: PresenceInitEvent = {
      selfId: user.id,
      contacts: this.usersService.getAll().filter((u) => u.id !== user.id),
    };
    client.emit(PresenceEvents.INIT, initPayload);

    const joinedPayload: PresenceJoinedEvent = user;
    client.broadcast.emit(PresenceEvents.JOINED, joinedPayload);
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
}
