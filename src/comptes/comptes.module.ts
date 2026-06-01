import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../entities/client.entity';
import { Compte } from '../entities/compte.entity';
import { ComptePinOtp } from '../entities/compte-pin-otp.entity';
import { Typecompte } from '../entities/typecompte.entity';
import { ComptesController } from './comptes.controller';
import { ComptesService } from './comptes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Compte, Client, ComptePinOtp, Typecompte])],
  controllers: [ComptesController],
  providers: [ComptesService],
})
export class ComptesModule {}
