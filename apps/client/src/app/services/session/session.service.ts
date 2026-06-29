import { inject, Injectable, signal } from '@angular/core';
import { UserData } from '@chat/api-interfaces';
import { isValidHttpUrl } from '../../utils/url-validator';
import { UserGeneratorService } from '../user-generator/user-generator.service';

export const CURRENT_USER_DATA_KEY = 'currentUserData';
export const CURRENT_USER_ID_KEY = 'currentUserId';

@Injectable({
  providedIn: 'root',
})
export class SessionService {
  private readonly _currentUserData = signal<UserData | null>(null);
  private readonly _currentUserId = signal<string | null>(null);

  public readonly currentUserData = this._currentUserData.asReadonly();
  public readonly currentUserId = this._currentUserId.asReadonly();

  private readonly userGenerator = inject(UserGeneratorService);

  /*
   * Initialize `currentUserData`/`currentUserId` with the data
   * from localStorage/sessionStorage
   */
  public init(): void {
    let userData = this.getCurrentUserData();
    let userId = null;

    if (userData === null) {
      userData = this.userGenerator.generateUser();
      localStorage.setItem(CURRENT_USER_DATA_KEY, JSON.stringify(userData));
      sessionStorage.removeItem(CURRENT_USER_ID_KEY);
    } else {
      userId = this.getCurrentUserId();
    }

    this._currentUserData.set(userData);
    this._currentUserId.set(userId);
  }

  public setCurrentUserId(userId: string): void {
    sessionStorage.setItem(CURRENT_USER_ID_KEY, userId);
    this._currentUserId.set(userId);
  }

  private getCurrentUserData(): UserData | null {
    const item = localStorage.getItem(CURRENT_USER_DATA_KEY);
    if (item === null) return null;

    try {
      const userData = JSON.parse(item);
      if (this.isUserData(userData)) {
        return userData;
      }
      throw new Error('Data is not a valid user data!');
    } catch {
      // self-heal on broken user data
      localStorage.removeItem(CURRENT_USER_DATA_KEY);
      return null;
    }
  }

  private getCurrentUserId(): string | null {
    return sessionStorage.getItem(CURRENT_USER_ID_KEY);
  }

  private isUserData(obj: unknown): obj is UserData {
    return (
      obj !== null &&
      typeof obj === 'object' &&
      'name' in obj &&
      typeof obj.name === 'string' &&
      obj.name.trim() !== '' &&
      'avatarUrl' in obj &&
      typeof obj.avatarUrl === 'string' &&
      isValidHttpUrl(obj.avatarUrl)
    );
  }
}
