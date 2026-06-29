import { Injectable } from '@angular/core';
import { UserData } from '@chat/api-interfaces';
import { FIRST_NAMES, LAST_NAMES } from './user-generator-constants';

@Injectable({
  providedIn: 'root',
})
export class UserGeneratorService {
  private readonly firstNames: string[] = FIRST_NAMES;
  private readonly lastNames: string[] = LAST_NAMES;

  public generateUser(): UserData {
    const firstName = this.getRandomElement(this.firstNames);
    const lastName = this.getRandomElement(this.lastNames);
    const fullName = `${firstName} ${lastName}`;

    const seed = encodeURIComponent(
      fullName.toLowerCase().replace(/\s+/g, '_'),
    );
    const avatarUrl = `https://api.dicebear.com/10.x/avataaars/svg?seed=${seed}`;

    return {
      name: fullName,
      avatarUrl: avatarUrl,
    };
  }

  private getRandomElement(array: string[]): string {
    return array[Math.floor(Math.random() * array.length)];
  }
}
