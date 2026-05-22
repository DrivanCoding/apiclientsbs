import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import { Client } from '../entities/client.entity';
import { Compte } from '../entities/compte.entity';
import { ComptePinOtp } from '../entities/compte-pin-otp.entity';
import { ConfirmPinSetupDto } from './dto/confirm-pin-setup.dto';
import { RequestPinOtpDto } from './dto/request-pin-otp.dto';
import { VerifyComptePinDto } from './dto/verify-compte-pin.dto';

@Injectable()
export class ComptesService {
  constructor(
    @InjectRepository(Compte)
    private readonly repository: Repository<Compte>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(ComptePinOtp)
    private readonly otpRepository: Repository<ComptePinOtp>,
  ) {}

  async create(payload: Partial<Compte>) {
    const pin_code = await this.hashPin(payload.pin_code);
    const saved = await this.repository.save({ ...payload, pin_code });
    return this.toCompteResponse(saved);
  }

  async findAll() {
    const comptes = await this.repository.find();
    return comptes.map((compte) => this.toCompteResponse(compte));
  }

  async findOne(id: number) {
    const compte = await this.repository.findOneBy({ idcompte: id });
    return compte ? this.toCompteResponse(compte) : null;
  }

  async findByClient(idclient: number) {
    const comptes = await this.repository.find({
      where: { idclient },
      order: { idcompte: 'ASC' },
    });
    return comptes.map((compte) => this.toCompteResponse(compte, false));
  }

  async findByAgence(idag: number) {
    const comptes = await this.repository.find({
      where: { idag },
      order: { idcompte: 'ASC' },
    });
    return comptes.map((compte) => this.toCompteResponse(compte));
  }

  async verifyPinAndGetCompteDetail(
    idcompte: number,
    payload: VerifyComptePinDto,
  ) {
    const where = payload.idclient
      ? { idcompte, idclient: payload.idclient }
      : { idcompte };

    const compte = await this.repository.findOneBy(where);
    if (!compte) {
      throw new NotFoundException('Compte introuvable');
    }

    if (!compte.pin_code) {
      return this.toCompteResponse(compte, true);
    }

    const isMatch = await bcrypt.compare(payload.pin_code, compte.pin_code);
    if (!isMatch) {
      throw new UnauthorizedException('Code PIN incorrect');
    }

    return this.toCompteResponse(compte, true);
  }

  async requestPinSetupOtp(payload: RequestPinOtpDto) {
    const compte = await this.repository.findOneBy({
      idcompte: payload.idcompte,
      idclient: payload.idclient,
    });

    if (!compte) {
      throw new NotFoundException('Compte introuvable pour ce client');
    }

    if (compte.pin_code) {
      throw new BadRequestException('Le code PIN est deja configure');
    }

    const client = await this.clientRepository.findOneBy({
      idclient: payload.idclient,
    });
    const email = client?.email?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException(
        "Le client n'a pas d'email pour recevoir le code OTP",
      );
    }

    await this.otpRepository.delete({
      idclient: payload.idclient,
      idcompte: payload.idcompte,
      consumed_at: IsNull(),
    });

    const otpCode = this.generateOtpCode();
    const otpHash = await bcrypt.hash(otpCode, 10);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

    await this.otpRepository.save({
      idclient: payload.idclient,
      idcompte: payload.idcompte,
      otp_code_hash: otpHash,
      expires_at: expiresAt,
      attempts: 0,
      consumed_at: null,
    });

    const delivery = await this.sendPinOtpEmail(email, otpCode, payload.idcompte);

    return {
      success: true,
      delivery,
      expires_at: expiresAt.toISOString(),
      message: 'Un code OTP a ete envoye par email',
    };
  }

  async confirmPinSetup(payload: ConfirmPinSetupDto) {
    const compte = await this.repository.findOneBy({
      idcompte: payload.idcompte,
      idclient: payload.idclient,
    });
    if (!compte) {
      throw new NotFoundException('Compte introuvable pour ce client');
    }

    if (compte.pin_code) {
      throw new BadRequestException('Le code PIN est deja configure');
    }

    const now = new Date();
    const otpRecord = await this.otpRepository.findOne({
      where: {
        idclient: payload.idclient,
        idcompte: payload.idcompte,
        consumed_at: IsNull(),
      },
      order: { id: 'DESC' },
    });

    if (!otpRecord) {
      throw new BadRequestException('Aucun OTP actif trouve');
    }

    if (otpRecord.expires_at.getTime() < now.getTime()) {
      throw new BadRequestException('Le code OTP a expire');
    }

    if (otpRecord.attempts >= 5) {
      throw new UnauthorizedException('OTP bloque apres plusieurs tentatives');
    }

    const isOtpValid = await bcrypt.compare(
      payload.otp_code,
      otpRecord.otp_code_hash,
    );
    if (!isOtpValid) {
      await this.otpRepository.update(otpRecord.id, {
        attempts: otpRecord.attempts + 1,
      });
      throw new UnauthorizedException('Code OTP invalide');
    }

    const pinHash = await this.hashPin(payload.pin_code);
    await this.repository.update(compte.idcompte, {
      pin_code: pinHash,
    });
    await this.otpRepository.update(otpRecord.id, {
      consumed_at: now,
      attempts: otpRecord.attempts + 1,
    });

    const updated = await this.repository.findOneBy({ idcompte: compte.idcompte });
    return {
      success: true,
      compte: updated ? this.toCompteResponse(updated, false) : null,
      message: 'Code PIN configure avec succes',
    };
  }

  async update(id: number, payload: Partial<Compte>) {
    const pin_code =
      payload.pin_code !== undefined
        ? await this.hashPin(payload.pin_code)
        : undefined;

    const updatePayload =
      pin_code !== undefined ? { ...payload, pin_code } : payload;

    const result = await this.repository.update(id, updatePayload);
    const updated = await this.repository.findOneBy({ idcompte: id });

    return {
      ...result,
      compte: updated ? this.toCompteResponse(updated) : null,
    };
  }

  remove(id: number) {
    return this.repository.delete(id);
  }

  private generateOtpCode() {
    const value = Math.floor(100000 + Math.random() * 900000);
    return String(value);
  }

  private async sendPinOtpEmail(
    to: string,
    otpCode: string,
    idcompte: number,
  ): Promise<'email' | 'console'> {
    const host = process.env.SMTP_HOST?.trim();
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();
    const from = process.env.SMTP_FROM?.trim() || user || 'no-reply@sbs.local';
    const secure = (process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true';

    const subject = 'Votre code OTP de configuration PIN';
    const text = [
      'Bonjour,',
      '',
      `Votre code OTP est: ${otpCode}`,
      'Ce code expire dans 10 minutes.',
      `Compte concerne: #${idcompte}`,
      '',
      "Si vous n'etes pas a l'origine de cette demande, ignorez cet email.",
    ].join('\n');

    if (!host || !user || !pass) {
      console.warn(
        `[PIN-OTP] SMTP non configure. OTP compte #${idcompte} pour ${to}: ${otpCode}`,
      );
      return 'console';
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to,
      subject,
      text,
    });
    return 'email';
  }

  private async hashPin(pin?: string) {
    if (!pin) return undefined;
    const normalized = pin.trim();
    if (!/^\d{4,6}$/.test(normalized)) {
      throw new BadRequestException('Le code PIN doit contenir 4 a 6 chiffres');
    }
    return bcrypt.hash(normalized, 10);
  }

  private toCompteResponse(compte: Compte, includeSensitive = true) {
    const { pin_code: _pin, ...safeCompte } = compte;
    return {
      ...safeCompte,
      solde: includeSensitive ? safeCompte.solde : _pin ? null : safeCompte.solde,
      has_pin: Boolean(_pin),
    };
  }
}
