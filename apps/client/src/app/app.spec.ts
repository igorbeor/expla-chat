import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { APP_CONFIG } from '../environments/app-config.token';
import { environment } from '../environments/environment';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      // App now hosts the sidebar/chat shell, which pulls in services that
      // ultimately depend on APP_CONFIG (SocketService). Provide it for the test.
      providers: [{ provide: APP_CONFIG, useValue: environment }],
    }).compileComponents();
  });

  it('should create the app shell', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
