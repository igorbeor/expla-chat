import { UserHandshakeAuth } from "@chat/api-interfaces";
import { Transform } from "class-transformer";
import { IsOptional, IsUrl, IsUUID, Length } from "class-validator";

export class UserHandshakeAuthDto implements UserHandshakeAuth {
  @IsOptional()
  @IsUUID()
  id?: string | undefined;

  @Transform(({ value }) => value?.trim())
  @Length(1, 150)
  name!: string;

  @IsUrl()
  avatarUrl!: string;
}