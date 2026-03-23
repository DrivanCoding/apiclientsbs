import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'change-me',
    });
  }

  async validate(
    payload: {
      sub: number;
      email?: string;
      login?: string;
      accountType?: 'admin' | 'client';
      role?: string;
      roles?: string[];
      idag?: number;
      nom?: string;
      prenom?: string;
    },
  ) {
    if (payload.accountType === 'admin') {
      return {
        sub: payload.sub,
        iduser: payload.sub,
        email: payload.email,
        login: payload.login,
        accountType: 'admin',
        role: payload.role ?? 'ADMIN',
        roles: payload.roles ?? ['ADMIN'],
        idag: payload.idag,
        nom: payload.nom,
        prenom: payload.prenom,
      };
    }

    return {
      sub: payload.sub,
      idclient: payload.sub,
      email: payload.email,
      accountType: 'client',
      roles: payload.roles ?? ['CLIENT'],
    };
  }
}
