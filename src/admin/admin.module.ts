import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Agence } from '../entities/agence.entity';
import { User } from '../entities/user.entity';
import { Compte } from '../entities/compte.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Agence, User, Compte])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
