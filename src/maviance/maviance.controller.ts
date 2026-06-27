import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MaviancePaymentService } from './maviance-payment.service';
import { MavianceVerificationService } from './maviance-verification.service';
import { QuoteRequestDto } from './dto/quote-request.dto';
import { CollectRequestDto } from './dto/collect-request.dto';
import { MavianceTransaction } from '../entities/maviance-transaction.entity';

@Controller('api/maviance')
export class MavianceController {
  constructor(
    private readonly paymentService: MaviancePaymentService,
    private readonly verificationService: MavianceVerificationService,
  ) {}

  @Get('services')
  @UseGuards(JwtAuthGuard)
  async getServices() {
    const services = await this.paymentService.getServices();
    return {
      message: 'Liste des services Maviance récupérée avec succès.',
      services,
    };
  }

  @Post('quote')
  @UseGuards(JwtAuthGuard)
  async requestQuote(
    @Body() dto: QuoteRequestDto,
    @Req() req: { user?: { idclient?: number; iduser?: number } },
  ) {
    const idclient = req.user?.idclient ? Number(req.user.idclient) : undefined;
    const iduser = req.user?.iduser ? Number(req.user.iduser) : undefined;

    const quote = await this.paymentService.requestQuote(dto, dto.idcompte, idclient, iduser);
    return {
      message: 'Quote Maviance générée avec succès.',
      quote,
    };
  }

  @Post('collect')
  @UseGuards(JwtAuthGuard)
  async collect(
    @Body() dto: CollectRequestDto,
    @Req() req: { user?: { idclient?: number; iduser?: number } },
  ) {
    const idclient = req.user?.idclient ? Number(req.user.idclient) : undefined;
    const iduser = req.user?.iduser ? Number(req.user.iduser) : undefined;

    const transaction = await this.paymentService.collect(dto, iduser, idclient);
    return {
      message: transaction.status === 'SUCCESS' ? 'Paiement effectué avec succès.' : 'Paiement initié, en attente de confirmation.',
      transaction,
    };
  }

  @Get('transactions/:reference')
  @UseGuards(JwtAuthGuard)
  async getTransaction(@Param('reference') reference: string): Promise<MavianceTransaction> {
    return this.verificationService.manualVerify(reference);
  }

  @Post('transactions/:reference/verify')
  @UseGuards(JwtAuthGuard)
  async verifyTransaction(@Param('reference') reference: string): Promise<MavianceTransaction> {
    return this.verificationService.manualVerify(reference);
  }
}
