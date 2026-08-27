import {
  Controller,
  Post,
  Body,
  Req,
  Logger,
  HttpCode,
  HttpStatus,
  Headers,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { TransactionsService } from './transactions.service';

@Controller(['api/paynote', 'paynote'])
export class PaynoteWebhookController {
  private readonly logger = new Logger(PaynoteWebhookController.name);

  constructor(private readonly transactionsService: TransactionsService) {}

  private verifyWebhookSecret(headerSecret?: string, querySecret?: string) {
    const expected = String(process.env.PAYNOTE_WEBHOOK_SECRET || '').trim();
    if (!expected) {
      throw new ServiceUnavailableException(
        'PAYNOTE_WEBHOOK_SECRET doit etre configure avant d activer le webhook.',
      );
    }
    const candidate = String(headerSecret || querySecret || '').trim();
    const expectedBuffer = Buffer.from(expected);
    const candidateBuffer = Buffer.from(candidate);
    if (
      expectedBuffer.length !== candidateBuffer.length ||
      !timingSafeEqual(expectedBuffer, candidateBuffer)
    ) {
      throw new UnauthorizedException('Webhook Paynote non autorise');
    }
  }

  @Post(['webhook', 'notif', 'notification'])
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: any,
    @Req() req: Request,
    @Headers('x-paynote-webhook-secret') headerSecret?: string,
    @Query('token') querySecret?: string,
  ) {
    this.verifyWebhookSecret(headerSecret, querySecret);
    this.logger.log(`Paynote webhook recu depuis ${req.ip}`);
    return this.transactionsService.handlePaynoteWebhook(payload);
  }
}
