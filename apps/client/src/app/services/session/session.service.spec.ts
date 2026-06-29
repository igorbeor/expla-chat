import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserData } from '@chat/api-interfaces';

import { CURRENT_USER_DATA_KEY, CURRENT_USER_ID_KEY, SessionService } from './session.service';
import { UserGeneratorService } from '../user-generator/user-generator.service';

// Known value returned by the mocked UserGeneratorService.generateUser().
const GENERATED_USER: UserData = {
  name: 'Test User',
  avatarUrl: 'https://example.com/a.svg',
};

// A valid, persisted profile distinct from the generated one, used for
// "returning visit" scenarios.
const STORED_USER: UserData = {
  name: 'Returning User',
  avatarUrl: 'https://example.com/returning.png',
};

describe('SessionService', () => {
  let service: SessionService;
  let generateUser: ReturnType<typeof vi.fn>;

  function configure(): void {
    generateUser = vi.fn().mockReturnValue({ ...GENERATED_USER });

    TestBed.configureTestingModule({
      providers: [
        {
          provide: UserGeneratorService,
          useValue: { generateUser },
        },
      ],
    });

    service = TestBed.inject(SessionService);
  }

  beforeEach(() => {
    // jsdom provides real localStorage/sessionStorage — start each test clean.
    localStorage.clear();
    sessionStorage.clear();
    configure();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // 1. Initial state, before init() — both signals are null.
  it('exposes null for both signals before init() is called', () => {
    expect(service.currentUserData()).toBeNull();
    expect(service.currentUserId()).toBeNull();
    expect(generateUser).not.toHaveBeenCalled();
  });

  // 2. First visit — empty localStorage.
  it('generates, persists and clears the session userId on first visit (empty storage)', () => {
    const removeSpy = vi.spyOn(Storage.prototype, 'removeItem');

    expect(localStorage.getItem(CURRENT_USER_DATA_KEY)).toBeNull();

    service.init();

    // generateUser is called exactly once and its result becomes the profile signal.
    expect(generateUser).toHaveBeenCalledTimes(1);
    expect(service.currentUserData()).toEqual(GENERATED_USER);

    // It is persisted to localStorage under the real key as JSON.
    expect(localStorage.getItem(CURRENT_USER_DATA_KEY)).toBe(
      JSON.stringify(GENERATED_USER),
    );

    // The sessionStorage userId is cleared and the userId signal is null.
    expect(removeSpy).toHaveBeenCalledWith(CURRENT_USER_ID_KEY);
    expect(sessionStorage.getItem(CURRENT_USER_ID_KEY)).toBeNull();
    expect(service.currentUserId()).toBeNull();
  });

  // 3. Returning visit — valid profile + sessionStorage userId.
  it('reuses the stored profile and userId on a returning visit, without regenerating', () => {
    localStorage.setItem(CURRENT_USER_DATA_KEY, JSON.stringify(STORED_USER));
    sessionStorage.setItem(CURRENT_USER_ID_KEY, 'user-123');

    service.init();

    // No regeneration.
    expect(generateUser).not.toHaveBeenCalled();

    // Profile and userId come from storage.
    expect(service.currentUserData()).toEqual(STORED_USER);
    expect(service.currentUserId()).toBe('user-123');

    // The stored profile is left untouched.
    expect(localStorage.getItem(CURRENT_USER_DATA_KEY)).toBe(
      JSON.stringify(STORED_USER),
    );
  });

  // Returning visit with a valid profile but no session userId yet.
  it('uses the stored profile but a null userId when sessionStorage has no userId', () => {
    localStorage.setItem(CURRENT_USER_DATA_KEY, JSON.stringify(STORED_USER));

    service.init();

    expect(generateUser).not.toHaveBeenCalled();
    expect(service.currentUserData()).toEqual(STORED_USER);
    expect(service.currentUserId()).toBeNull();
  });

  // 4. Corrupt localStorage — invalid JSON.
  it('self-heals corrupt JSON in localStorage by removing it and regenerating (treated as first visit)', () => {
    localStorage.setItem(CURRENT_USER_DATA_KEY, '{ not valid json');
    sessionStorage.setItem(CURRENT_USER_ID_KEY, 'stale-id');

    service.init();

    // Treated as a first visit: regenerate + persist.
    expect(generateUser).toHaveBeenCalledTimes(1);
    expect(service.currentUserData()).toEqual(GENERATED_USER);
    // The freshly generated (valid) profile is now stored.
    expect(localStorage.getItem(CURRENT_USER_DATA_KEY)).toBe(
      JSON.stringify(GENERATED_USER),
    );

    // The stale session userId is cleared and userId signal is null.
    expect(sessionStorage.getItem(CURRENT_USER_ID_KEY)).toBeNull();
    expect(service.currentUserId()).toBeNull();
  });

  // 5a. Valid JSON, invalid shape (missing avatarUrl).
  it('self-heals a profile that fails the shape guard (missing avatarUrl)', () => {
    localStorage.setItem(
      CURRENT_USER_DATA_KEY,
      JSON.stringify({ name: 'No Avatar' }),
    );

    service.init();

    expect(generateUser).toHaveBeenCalledTimes(1);
    expect(service.currentUserData()).toEqual(GENERATED_USER);
    expect(localStorage.getItem(CURRENT_USER_DATA_KEY)).toBe(
      JSON.stringify(GENERATED_USER),
    );
  });

  // 5b. Valid JSON, valid shape, but avatarUrl is not an http(s) URL.
  it('self-heals a profile whose avatarUrl is not a valid http(s) URL', () => {
    localStorage.setItem(
      CURRENT_USER_DATA_KEY,
      JSON.stringify({ name: 'Bad Url', avatarUrl: 'ftp://example.com/x.svg' }),
    );

    service.init();

    // isValidHttpUrl rejects the ftp scheme -> regenerated.
    expect(generateUser).toHaveBeenCalledTimes(1);
    expect(service.currentUserData()).toEqual(GENERATED_USER);
    expect(localStorage.getItem(CURRENT_USER_DATA_KEY)).toBe(
      JSON.stringify(GENERATED_USER),
    );
  });

  // 5c. Valid JSON, valid-ish shape, but a blank name (fails the trim guard).
  it('self-heals a profile whose name is blank/whitespace', () => {
    localStorage.setItem(
      CURRENT_USER_DATA_KEY,
      JSON.stringify({ name: '   ', avatarUrl: 'https://example.com/a.svg' }),
    );

    service.init();

    expect(generateUser).toHaveBeenCalledTimes(1);
    expect(service.currentUserData()).toEqual(GENERATED_USER);
  });

  // 6. setCurrentUserId — updates the signal AND persists to sessionStorage.
  it('setCurrentUserId sets the signal and persists the id to sessionStorage', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    service.setCurrentUserId('abc-789');

    // Signal updated.
    expect(service.currentUserId()).toBe('abc-789');

    // Persisted to sessionStorage under the real key.
    expect(setItemSpy).toHaveBeenCalledWith(CURRENT_USER_ID_KEY, 'abc-789');
    expect(sessionStorage.getItem(CURRENT_USER_ID_KEY)).toBe('abc-789');
  });

  it('setCurrentUserId overwrites a previously set userId', () => {
    service.setCurrentUserId('first');
    expect(sessionStorage.getItem(CURRENT_USER_ID_KEY)).toBe('first');

    service.setCurrentUserId('second');
    expect(service.currentUserId()).toBe('second');
    expect(sessionStorage.getItem(CURRENT_USER_ID_KEY)).toBe('second');
  });
});
