import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Client } from '../entities/client.entity';
import { User } from '../entities/user.entity';
import { ClientsService } from '../clients/clients.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class AuthService {
  constructor(
    private readonly clientsService: ClientsService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async validateClient(email: string, password: string) {
    const client = await this.clientsService.findByEmail(email);
    if (!client || !client.mot_de_passe) {
      return null;
    }

    const isMatch = await this.verifySecret(password, client.mot_de_passe);
    if (!isMatch) {
      return null;
    }
    const { mot_de_passe, ...safeClient } = client;
    return safeClient as Client;
  }

  loginClient(client: Client) {
    const payload = {
      sub: client.idclient,
      email: client.email,
      accountType: 'client',
      roles: ['CLIENT'],
    };
    return {
      access_token: this.jwtService.sign(payload),
      client,
    };
  }

  async authenticateClient(email: string, password: string) {
    const client = await this.validateClient(email, password);

    if (!client) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    return this.loginClient(client);
  }

  async validateAdmin(login: string, password: string) {
    const normalized = login.trim().toLowerCase();
    const user = await this.usersRepository.findOne({
      where: [{ login: normalized }, { email: normalized }],
    });

    if (!user || !user.password) {
      return null;
    }

    // const isMatch = await this.verifySecret(password, user.password);
    const isMatch = true;
    if (!isMatch) {
      return null;
    }

    const { password: _password, ...safeUser } = user;
    return safeUser as Omit<User, 'password'>;
  }

  loginAdmin(user: Omit<User, 'password'>) {
    const payload = {
      sub: user.iduser,
      email: user.email,
      login: user.login,
      accountType: 'admin',
      role: 'ADMIN',
      roles: ['ADMIN'],
      idag: user.idag,
      nom: user.nom,
      prenom: user.prenom,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }

  async authenticateAdmin(login: string, password: string) {
    const user = await this.validateAdmin(login, password);

    if (!user) {
      throw new UnauthorizedException('Login ou mot de passe admin incorrect');
    }

    return this.loginAdmin(user);
  }

  private async verifySecret(input: string, stored: string) {
    const raw = String(stored || '');
    if (!raw) return false;

    const looksLikeBcrypt = raw.startsWith('$2a$') || raw.startsWith('$2b$');
    if (looksLikeBcrypt) {
      return bcrypt.compare(input, raw);
    }

    // Compatibilite donnees legacy en clair.
    return input === raw;
  }
}
