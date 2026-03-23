import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Compte } from '../entities/compte.entity';
import { ComptesService } from './comptes.service';
import { VerifyComptePinDto } from './dto/verify-compte-pin.dto';

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

  @Post(':id/verify-pin')
  verifyPin(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: VerifyComptePinDto,
  ) {
    return this.service.verifyPinAndGetCompteDetail(id, payload);
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
