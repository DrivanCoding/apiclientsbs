import { Controller, Post, Req, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';
import { MaviancePaymentService } from './maviance-payment.service';

@Controller('api/maviance')
export class MavianceWebhookController {
  private readonly logger = new Logger(MavianceWebhookController.name);

  constructor(private readonly paymentService: MaviancePaymentService) {}

  @Post('webhook')
  async handleWebhook(@Req() req: Request) {
    const signatureHeader = req.headers['x-signature'] as string;
    const rawBody = (req as any).rawBody; // Extracted as a Buffer via NestJS rawBody option

    const secret = process.env.MAVIANCE_ACCESS_SECRET || '';
    const isProduction = process.env.MAVIANCE_ENV === 'production';

    if (isProduction) {
      if (!signatureHeader) {
        this.logger.error('Access denied: Webhook signature is missing in production.');
        throw new UnauthorizedException('Signature webhook manquante.');
      }
      if (!rawBody) {
        this.logger.error('Access denied: Webhook raw body is missing in production.');
        throw new BadRequestException('Corps de requête brut manquant.');
      }

      const computedSignature = crypto
        .createHmac('sha1', secret)
        .update(rawBody)
        .digest('hex');

      // Use Timing-safe comparison to prevent timing side-channel attacks (Finding 2)
      try {
        const signatureBuffer = Buffer.from(signatureHeader, 'hex');
        const computedBuffer = Buffer.from(computedSignature, 'hex');

        if (signatureBuffer.length !== computedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, computedBuffer)) {
          this.logger.error('Access denied: Webhook signature mismatch in production.');
          throw new UnauthorizedException('Signature webhook invalide.');
        }
      } catch (e) {
        this.logger.error(`Access denied: TimingSafeEqual signature comparison error: ${e.message}`);
        throw new UnauthorizedException('Signature webhook invalide.');
      }
    } else {
      // In staging/sandbox/testing mode, validate and log warning, but do not block flow (Open Question resolution)
      if (!signatureHeader || !rawBody) {
        this.logger.warn('Webhook reçu sans signature ou corps brut en mode test.');
      } else {
        const computedSignature = crypto
          .createHmac('sha1', secret)
          .update(rawBody)
          .digest('hex');

        if (signatureHeader !== computedSignature) {
          this.logger.warn(`Signature webhook non valide en mode test. Reçu: ${signatureHeader}, Attendu: ${computedSignature}`);
        } else {
          this.logger.log('Signature webhook vérifiée avec succès en mode test.');
        }
      }
    }

    // Process the transaction update (req.body is already parsed JSON)
    await this.paymentService.handleWebhook(req.body);

    return { status: 'accepted' };
  }
}
