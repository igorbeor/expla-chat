import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { User, UserStatuses, UserTypes } from '@chat/api-interfaces';
import { UsersService } from './users.service';

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'u1',
  name: 'Alice',
  avatarUrl: 'https://example.com/a.png',
  status: UserStatuses.ONLINE,
  type: UserTypes.USER,
  ...overrides,
});

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('add() registers a user and getAll() returns it', () => {
    const user = makeUser();

    service.add(user);

    expect(service.getAll()).toHaveLength(1);
    expect(service.getAll()).toContainEqual(user);
  });

  it('get() returns the user by id', () => {
    const user = makeUser();
    service.add(user);

    expect(service.get('u1')).toEqual(user);
  });

  it('get() returns undefined for an unknown id', () => {
    expect(service.get('nope')).toBeUndefined();
  });

  it('remove() deletes an existing user', () => {
    service.add(makeUser());

    service.remove('u1');

    expect(service.get('u1')).toBeUndefined();
    expect(service.getAll()).toHaveLength(0);
  });

  it('remove() on a non-existent id does not throw (idempotent)', () => {
    expect(() => service.remove('nope')).not.toThrow();
  });

  it('remove() called twice is idempotent', () => {
    service.add(makeUser());

    service.remove('u1');

    expect(() => service.remove('u1')).not.toThrow();
    expect(service.get('u1')).toBeUndefined();
  });

  it('updateStatus() updates an existing user status', () => {
    service.add(makeUser({ status: UserStatuses.ONLINE }));

    service.updateStatus('u1', UserStatuses.AWAY);

    expect(service.get('u1')?.status).toBe(UserStatuses.AWAY);
  });

  it('updateStatus() on a non-existent id does not throw, logs a warning', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    expect(() =>
      service.updateStatus('nope', UserStatuses.AWAY)
    ).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nope'));

    warnSpy.mockRestore();
  });

  it('updateStatus() replaces with a new object (immutability), does not mutate the stored reference', () => {
    service.add(makeUser({ status: UserStatuses.ONLINE }));
    const before = service.get('u1');

    service.updateStatus('u1', UserStatuses.AWAY);
    const after = service.get('u1');

    expect(after).not.toBe(before);
    expect(before?.status).toBe(UserStatuses.ONLINE);
    expect(after?.status).toBe(UserStatuses.AWAY);
  });

  it('initBots() registers all provided bots; getAll() includes them', () => {
    const echo = makeUser({ id: 'bot-echo', name: 'Echo', type: UserTypes.BOT });
    const reverse = makeUser({ id: 'bot-reverse', name: 'Reverse', type: UserTypes.BOT });

    service.initBots([echo, reverse]);

    expect(service.getAll()).toHaveLength(2);
    expect(service.getAll()).toEqual(expect.arrayContaining([echo, reverse]));
  });

  it('getAll() returns a copy — mutating the result does not affect internal registry', () => {
    service.add(makeUser());

    const list = service.getAll();
    list.push(makeUser({ id: 'rogue' }));

    expect(service.getAll()).toHaveLength(1);
    expect(service.get('rogue')).toBeUndefined();
  });
});
