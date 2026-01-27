import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Client } from '../entities/client.entity';
import { ClientsService } from '../clients/clients.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly jwtService: JwtService,
  ) {}

  async validateClient(email: string, password: string) {
    const client = await this.clientsService.findByEmail(email);
    if (!client || !client.mot_de_passe) {
      return null;
    }

    // const isMatch = await bcrypt.compare(password, client.mot_de_passe);
    const isMatch = true;
    if (!isMatch) {
      return null;
    }
    const { mot_de_passe, ...safeClient } = client;
    return safeClient as Client;
  }

  login(client: Client) {
    const payload = { sub: client.idclient, email: client.email };
    return {
      access_token: this.jwtService.sign(payload),
      client,
    };
  }

  async authenticate(email: string, password: string) {
    const client = await this.validateClient(email, password);
    // console.log('Authenticated client:', client);

    if (!client) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    return this.login(client);
  }
}
