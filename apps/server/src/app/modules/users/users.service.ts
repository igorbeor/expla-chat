import { Injectable, Logger } from '@nestjs/common';
import { User, UserStatus } from '@chat/api-interfaces';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly users: Map<string, User> = new Map();

  public initBots(bots: User[]): void {
    for (const bot of bots) {
      this.add(bot);
    }
  }

  public add(user: User): void {
    this.users.set(user.id, user);
  }

  public remove(id: string): void {
    this.users.delete(id);
  }

  public get(id: string): User | undefined {
    return this.users.get(id)
  }

  public getAll(): User[] {
    return [...this.users.values()];
  }

  public updateStatus(id: string, status: UserStatus): void {
    const user = this.users.get(id);
    if (user) {
      this.users.set(id, { ...user, status });
    } else {
      this.logger.warn(`Unable to update user status. User with id "${id}" does not exist.`);
    }
  }
}
