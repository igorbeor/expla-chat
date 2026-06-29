import { Injectable } from '@angular/core';
import { UserData } from '@chat/api-interfaces';

@Injectable({
  providedIn: 'root',
})
export class UserGeneratorService {
  private readonly firstNames: string[] = [
    'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 
    'Michael', 'Linda', 'William', 'Elizabeth', 'David', 'Barbara', 
    'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah'
  ];

  private readonly lastNames: string[] = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 
    'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 
    'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore'
  ];
  
  public generateUser(): UserData {
    const firstName = this.getRandomElement(this.firstNames);
    const lastName = this.getRandomElement(this.lastNames);
    const fullName = `${firstName} ${lastName}`;
    
    const seed = encodeURIComponent(fullName.toLowerCase().replace(/\s+/g, '_'));
    const avatarUrl = `https://api.dicebear.com/10.x/avataaars/svg?seed=${seed}`;

    return {
      name: fullName,
      avatarUrl: avatarUrl
    };
  }

  private getRandomElement(array: string[]): string {
    return array[Math.floor(Math.random() * array.length)];
  }
}
