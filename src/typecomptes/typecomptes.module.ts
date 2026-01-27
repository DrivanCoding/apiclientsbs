import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Typecompte } from '../entities/typecompte.entity';
import { TypecomptesController } from './typecomptes.controller';
import { TypecomptesService } from './typecomptes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Typecompte])],
  controllers: [TypecomptesController],
  providers: [TypecomptesService],
})
export class TypecomptesModule {}
