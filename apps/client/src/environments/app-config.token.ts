import { InjectionToken } from '@angular/core';
import { Environment } from './environment.model';

export const APP_CONFIG = new InjectionToken<Environment>(
  'Application Config',
);
