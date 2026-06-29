import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { SessionService } from './services/session/session.service';
import { SocketService } from './services/socket/socket.service';
import { PresenceService } from './services/presence/presence.service';
import { APP_CONFIG } from '../environments/app-config.token';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: APP_CONFIG, useValue: environment },
    provideAppInitializer(() => {
      const session = inject(SessionService);
      const socket = inject(SocketService);
      const presence = inject(PresenceService);
      session.init();
      socket.connect(() => ({
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        ...session.currentUserData()!,
        id: session.currentUserId() ?? undefined,
      }));
      // Attach real-time listeners right after connect so the server's
      // `presence:init` (sent on connection) is captured.
      presence.init();
    }),
  ],
};
