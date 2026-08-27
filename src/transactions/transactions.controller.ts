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
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { Transaction } from '../entities/transaction.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../auth/admin-role.guard';
import { TransactionsService } from './transactions.service';
import { DepositDto } from './dto/deposit.dto';
import { OuvertureCompteDto } from './dto/ouverture-compte.dto';
import { PreouvertureDto } from './dto/preouverture.dto';
import { CollecteSyncNotificationDto } from './dto/collecte-sync-notification.dto';

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
  const acceptedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!acceptedMimeTypes.includes(file.mimetype)) {
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
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
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

  @Post('recheck-status/:references')
  @UseGuards(JwtAuthGuard)
  recheckStatus(
    @Param('references') references: string,
    @Req() req: { user?: { idclient?: number } },
  ) {
    const idclient = Number(req.user?.idclient || 0);
    return this.service.recheckTransactionStatus(references, idclient);
  }

  @Post('core-sync/collecte-notification')
  syncCollecteNotification(
    @Body() dto: CollecteSyncNotificationDto,
    @Headers('x-server-sync-token') syncToken?: string,
  ) {
    const expectedToken = (
      process.env.CORE_SYNC_TOKEN ||
      process.env.SBSCLIENT_CORE_SYNC_TOKEN ||
      ''
    ).trim();
    if (!expectedToken || syncToken !== expectedToken) {
      throw new UnauthorizedException('Token de synchronisation core invalide');
    }

    return this.service.syncCollecteNotification(dto);
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
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    const pageNum = page ? parseInt(page, 10) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : undefined;
    return this.service.findAll(pageNum, limitNum);
  }

  @Get('client/:id')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  findByClient(
    @Param('id', ParseIntPipe) id: number,
    @Query('date_debut') dateDebut?: string,
    @Query('date_fin') dateFin?: string,
  ) {
    return this.service.findByClient(id, dateDebut, dateFin);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: Partial<Transaction>,
  ) {
    return this.service.update(id, payload);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminRoleGuard)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
