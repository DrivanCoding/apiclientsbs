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

@Controller('comptes')
export class ComptesController {
  constructor(private readonly service: ComptesService) {}

  @Post()
  create(@Body() payload: Partial<Compte>) {
    return this.service.create(payload);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
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

  @Get('client/:id')
  findByClient(@Param('id', ParseIntPipe) id: number) {
    return this.service.findByClient(id);
  }
}
