import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';
import { PushController } from './push.controller';

@Global()
@Module({
  providers: [NotificationsService, PushService],
  controllers: [NotificationsController, PushController],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
