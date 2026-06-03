import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { SignOptions } from 'jsonwebtoken';
import { ClientsModule } from '../clients/clients.module';
import { User } from '../entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    ClientsModule,
    TypeOrmModule.forFeature([User]),
    PassportModule,
    JwtModule.register({
      secret:
        process.env.JWT_ACCESS_SECRET ??
        process.env.JWT_SECRET ??
        'change-me',
      signOptions: {
        expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ?? '7d') as SignOptions['expiresIn'],
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
