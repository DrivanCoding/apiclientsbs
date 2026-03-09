import { Module } from '@nestjs/common';
import { PaynoteService } from './paynote.service';

@Module({
  providers: [PaynoteService],
  exports: [PaynoteService],
})
export class PaynoteModule {}
