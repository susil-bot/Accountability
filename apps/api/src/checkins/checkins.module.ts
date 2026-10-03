import { Module } from '@nestjs/common';
import { CheckInsController } from './checkins.controller';
import { CheckInsService } from './checkins.service';
import { TasksModule } from '../tasks/tasks.module';

@Module({ imports: [TasksModule], controllers: [CheckInsController], providers: [CheckInsService] })
export class CheckInsModule {}
