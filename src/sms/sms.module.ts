import { Global, Module } from '@nestjs/common';
import { MTargetSmsService } from './mtarget-sms.service';
import { SmsService } from './sms.service';

@Global()
@Module({
  providers: [MTargetSmsService, SmsService],
  exports: [SmsService],
})
export class SmsModule {}
