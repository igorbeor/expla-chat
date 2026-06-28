import { plainToInstance, Type } from 'class-transformer';
import { IsInt, IsUrl, Min, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  PORT = 3000;

  @IsUrl({ require_tld: false })
  CLIENT_ORIGIN = 'http://localhost:4200';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  GRACE_MS = 10_000;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true, // "3000" → 3000
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length) throw new Error(errors.toString());
  return validated;
}
