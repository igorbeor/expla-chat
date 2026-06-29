import { describe, it, expect, afterEach, vi } from 'vitest';
import { UserData } from '@chat/api-interfaces';

import { UserGeneratorService } from './user-generator.service';
import { FIRST_NAMES, LAST_NAMES } from './user-generator-constants';


/**
 * Index picked by the service = Math.floor(random * length).
 * So to deterministically select index `i` from an array of `length` items,
 * Math.random must return `i / length` (which floors back to `i`).
 *
 * generateUser() calls Math.random twice: first for the first name, then for
 * the last name. This helper builds the matching sequence.
 */
function randomFor(firstIdx: number, lastIdx: number): number[] {
  return [firstIdx / FIRST_NAMES.length, lastIdx / LAST_NAMES.length];
}

function mockRandomSequence(values: number[]): void {
  const spy = vi.spyOn(Math, 'random');
  values.forEach((v) => spy.mockReturnValueOnce(v));
}

describe('UserGeneratorService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    const service = new UserGeneratorService();
    expect(service).toBeTruthy();
  });

  it('returns a UserData-shaped object with non-empty string fields', () => {
    const service = new UserGeneratorService();

    const user: UserData = service.generateUser();

    expect(typeof user.name).toBe('string');
    expect(user.name.length).toBeGreaterThan(0);
    expect(typeof user.avatarUrl).toBe('string');
    expect(user.avatarUrl.length).toBeGreaterThan(0);
    // Exactly the UserData shape, no extra keys.
    expect(Object.keys(user).sort()).toEqual(['avatarUrl', 'name']);
  });

  it('produces a name of the form "First Last" drawn from the name pools', () => {
    const service = new UserGeneratorService();

    const { name } = service.generateUser();
    const parts = name.split(' ');

    // Two words separated by a single space.
    expect(parts).toHaveLength(2);
    expect(name).toBe(`${parts[0]} ${parts[1]}`);

    const [first, last] = parts;
    expect(FIRST_NAMES).toContain(first);
    expect(LAST_NAMES).toContain(last);
  });

  it('returns the exact name for stubbed Math.random values', () => {
    // Select index 0 (James) then index 0 (Smith).
    mockRandomSequence(randomFor(0, 0));
    const service = new UserGeneratorService();

    expect(service.generateUser().name).toBe('James Smith');
    expect(Math.random).toHaveBeenCalledTimes(2);
  });

  it('selects names at the chosen indices for a different stubbed sequence', () => {
    // Select index 6 (Michael) then index 4 (Jones).
    mockRandomSequence(randomFor(6, 4));
    const service = new UserGeneratorService();

    expect(service.generateUser().name).toBe(
      `${FIRST_NAMES[6]} ${LAST_NAMES[4]}`,
    );
  });

  it('builds the exact avatarUrl with a lowercased, space->underscore, URI-encoded seed', () => {
    // James Smith -> seed "james_smith".
    mockRandomSequence(randomFor(0, 0));
    const service = new UserGeneratorService();

    const { avatarUrl } = service.generateUser();

    expect(avatarUrl).toBe(
      'https://api.dicebear.com/10.x/avataaars/svg?seed=james_smith',
    );
  });

  it('avatarUrl is a valid http(s) URL', () => {
    const service = new UserGeneratorService();

    const { avatarUrl } = service.generateUser();
    const url = new URL(avatarUrl);

    expect(['http:', 'https:']).toContain(url.protocol);
    expect(url.hostname).toBe('api.dicebear.com');
    expect(url.searchParams.get('seed')).toBeTruthy();
  });

  it('different Math.random sequences produce different names', () => {
    const service = new UserGeneratorService();

    mockRandomSequence(randomFor(0, 0)); // James Smith
    const first = service.generateUser().name;

    vi.restoreAllMocks();

    mockRandomSequence(randomFor(6, 4)); // Michael Jones
    const second = service.generateUser().name;

    expect(first).not.toBe(second);
  });

  it('produces a seed with no spaces and all lowercase', () => {
    // Sarah Rodriguez -> "sarah_rodriguez": exercises a multi-syllable last name.
    mockRandomSequence(randomFor(17, 8));
    const service = new UserGeneratorService();

    const seed = new URL(service.generateUser().avatarUrl).searchParams.get(
      'seed',
    );

    expect(seed).toBe('sarah_rodriguez');
    expect(seed).not.toMatch(/\s/);
    expect(seed).toBe(seed?.toLowerCase());
  });
});