import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Compte } from '../entities/compte.entity';
import { ComptesService } from './comptes.service';
import { ConfirmPinSetupDto } from './dto/confirm-pin-setup.dto';
import { RequestPinOtpDto } from './dto/request-pin-otp.dto';
import { VerifyComptePinDto } from './dto/verify-compte-pin.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('comptes')
export class ComptesController {
  constructor(private readonly service: ComptesService) {}

  @Post()
  create(@Body() payload: Partial<Compte>) {
    return this.service.create(payload);
  }

  @Get('client/:id')
  findByClient(@Param('id', ParseIntPipe) id: number) {
    return this.service.findByClient(id);
  }

  @Get('agence/:id')
  findByAgence(@Param('id', ParseIntPipe) id: number) {
    return this.service.findByAgence(id);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Get(':id/releve')
  @UseGuards(JwtAuthGuard)
  async getReleve(
    @Param('id', ParseIntPipe) id: number,
    @Query('date_debut') dateDebut: string,
    @Query('date_fin') dateFin: string,
    @Req() req: { user?: { idclient?: number } },
    @Res() res: Response,
  ) {
    const idclient = Number(req.user?.idclient || 0);

    if (dateDebut && dateFin) {
      const start = new Date(dateDebut);
      const end = new Date(dateFin);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 30) {
        throw new BadRequestException('La période ne doit pas dépasser 30 jours.');
      }
    }

    const pdfBuffer = await this.service.getRelevePdf(
      id,
      idclient,
      dateDebut,
      dateFin,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="releve_compte_${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Post(':id/verify-pin')
  verifyPin(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: VerifyComptePinDto,
  ) {
    return this.service.verifyPinAndGetCompteDetail(id, payload);
  }

  @Post('pin/request-otp')
  requestPinOtp(@Body() payload: RequestPinOtpDto) {
    return this.service.requestPinSetupOtp(payload);
  }

  @Post('pin/confirm')
  confirmPin(@Body() payload: ConfirmPinSetupDto) {
    return this.service.confirmPinSetup(payload);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: Partial<Compte>,
  ) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
