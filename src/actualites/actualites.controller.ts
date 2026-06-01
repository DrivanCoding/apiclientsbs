import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActualitesService } from './actualites.service';
import { Actualite } from '../entities/actualite.entity';

@Controller('actualites')
export class ActualitesController {
  constructor(private readonly service: ActualitesService) {}

  @Get()
  async findAll(): Promise<Actualite[]> {
    return this.service.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Body() data: Partial<Actualite>,
    @Req() req: { user?: { accountType?: string } },
  ): Promise<Actualite> {
    const user = req.user;
    if (!user || user.accountType !== 'admin') {
      throw new ForbiddenException(
        "Vous n'êtes pas autorisé à publier des actualités",
      );
    }
    return this.service.create(data);
  }
}
