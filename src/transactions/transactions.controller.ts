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
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Transaction } from '../entities/transaction.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TransactionsService } from './transactions.service';
import { DepositDto } from './dto/deposit.dto';
import { OuvertureCompteDto } from './dto/ouverture-compte.dto';
import { PreouvertureDto } from './dto/preouverture.dto';

const preouvertureUploadDir = join(process.cwd(), 'uploads', 'preouverture');

function ensurePreouvertureUploadDir() {
  if (!existsSync(preouvertureUploadDir)) {
    mkdirSync(preouvertureUploadDir, { recursive: true });
  }
}

function imageFileFilter(
  _req: unknown,
  file: { mimetype: string },
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
    return callback(
      new BadRequestException(
        'Les documents doivent etre des images JPG, PNG ou WebP.',
      ),
      false,
    );
  }
  return callback(null, true);
}

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  @Post()
  create(@Body() payload: Partial<Transaction>) {
    return this.service.create(payload);
  }

  @Post('collecte')
  @UseGuards(JwtAuthGuard)
  collect(
    @Body() dto: DepositDto,
    @Req() req: { user?: { idclient?: number } },
  ) {
    const idclient = Number(req.user?.idclient || 0);
    return this.service.deposit(dto, idclient);
  }

  @Get('openable-typecomptes')
  @UseGuards(JwtAuthGuard)
  openableTypecomptes(@Req() req: { user?: { idclient?: number } }) {
    const idclient = Number(req.user?.idclient || 0);
    return this.service.openableTypecomptes(idclient);
  }

  @Post('ouverture-compte')
  @UseGuards(JwtAuthGuard)
  ouvertureCompte(
    @Body() dto: OuvertureCompteDto,
    @Req() req: { user?: { idclient?: number } },
  ) {
    const idclient = Number(req.user?.idclient || 0);
    return this.service.requestCompteOpening(dto, idclient);
  }

  @Get('operators')
  operators() {
    return this.service.activeOperators();
  }

  @Post('preouverture')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'photo_cni', maxCount: 1 },
        { name: 'photo_piece_recto', maxCount: 1 },
        { name: 'photo_piece_verso', maxCount: 1 },
        { name: 'photo_profil', maxCount: 1 },
        { name: 'signature', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: (_req, _file, callback) => {
            ensurePreouvertureUploadDir();
            callback(null, preouvertureUploadDir);
          },
          filename: (_req, file, callback) => {
            const uniqueSuffix = `${Date.now()}-${Math.round(
              Math.random() * 1e9,
            )}`;
            callback(
              null,
              `${file.fieldname}-${uniqueSuffix}${extname(file.originalname)}`,
            );
          },
        }),
        fileFilter: imageFileFilter,
        limits: { fileSize: 5 * 1024 * 1024 },
      },
    ),
  )
  preouverture(
    @Body() dto: PreouvertureDto,
    @UploadedFiles()
    files: Record<string, Array<{ filename: string; path: string }>>,
  ) {
    return this.service.preouvertureWithDeposit(dto, files);
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
