import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Transaction } from '../entities/transaction.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TransactionsService } from './transactions.service';
import { DepositDto } from './dto/deposit.dto';
import { PreouvertureDto } from './dto/preouverture.dto';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  @Post()
  create(@Body() payload: Partial<Transaction>) {
    return this.service.create(payload);
  }

  @Post('collecte')
  @UseGuards(JwtAuthGuard)
  collect(@Body() dto: DepositDto, @Req() req: { user?: { idclient?: number } }) {
    const idclient = Number(req.user?.idclient || 0);
    return this.service.deposit(dto, idclient);
  }

  @Post('preouverture')
  preouverture(@Body() dto: PreouvertureDto) {
    return this.service.preouvertureWithDeposit(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('client/:id')
  findByClient(@Param('id', ParseIntPipe) id: number) {
    return this.service.findByClient(id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: Partial<Transaction>,
  ) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
