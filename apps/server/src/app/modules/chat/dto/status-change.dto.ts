import { StatusChangeEvent, UserStatuses } from '@chat/api-interfaces';
import { IsIn } from 'class-validator';

export class StatusChangeDto implements StatusChangeEvent {
  @IsIn(Object.values(UserStatuses))
  status!: UserStatuses;
}
