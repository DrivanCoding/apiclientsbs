import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Agence } from '../entities/agence.entity';
import { AgencesController } from './agences.controller';
import { AgencesService } from './agences.service';

@Module({
  imports: [TypeOrmModule.forFeature([Agence])],
  controllers: [AgencesController],
  providers: [AgencesService],
})
export class AgencesModule {}
