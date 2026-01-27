import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Compte } from '../entities/compte.entity';
import { ComptesController } from './comptes.controller';
import { ComptesService } from './comptes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Compte])],
  controllers: [ComptesController],
  providers: [ComptesService],
})
export class ComptesModule {}
