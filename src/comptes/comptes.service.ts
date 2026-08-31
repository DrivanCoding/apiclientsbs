import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import { randomInt } from 'crypto';
import { Client } from '../entities/client.entity';
import { Compte } from '../entities/compte.entity';
import { ComptePinOtp } from '../entities/compte-pin-otp.entity';
import { Transaction } from '../entities/transaction.entity';
import { Typecompte } from '../entities/typecompte.entity';
import { ConfirmPinSetupDto } from './dto/confirm-pin-setup.dto';
import { RequestPinOtpDto } from './dto/request-pin-otp.dto';
import { VerifyComptePinDto } from './dto/verify-compte-pin.dto';
import { SmsService } from '../sms/sms.service';
import { CoreBankingStatementService } from './core-banking-statement.service';

export function buildPinOtpMessage(codeClient: string, otpCode: string) {
  return `Votre code OTP SBS pour configurer le PIN du compte ${codeClient} est: ${otpCode}. Il expire dans 10 minutes.`;
}

@Injectable()
export class ComptesService {
  private pinAttemptsMap = new Map<number, number>();

  constructor(
    @InjectRepository(Compte)
    private readonly repository: Repository<Compte>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(ComptePinOtp)
    private readonly otpRepository: Repository<ComptePinOtp>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Typecompte)
    private readonly typeCompteRepository: Repository<Typecompte>,
    private readonly smsService: SmsService,
    private readonly coreBankingStatementService: CoreBankingStatementService,
  ) {}

  private async getClientMasterPin(idclient: number): Promise<string | null> {
    const firstCompteWithPin = await this.repository.findOne({
      where: { idclient, pin_code: Not(IsNull()) },
      order: { idcompte: 'ASC' },
    });
    return firstCompteWithPin?.pin_code || null;
  }

  private async getFirstCompte(idclient: number): Promise<Compte | null> {
    return this.repository.findOne({
      where: { idclient },
      order: { idcompte: 'ASC' },
    });
  }

  async create(payload: Partial<Compte>) {
    const pin_code = await this.hashPin(payload.pin_code);
    const saved = await this.repository.save({ ...payload, pin_code });
    const typeCompte = await this.findTypeCompte(saved.idtype);
    const hasPin = saved.idclient
      ? (await this.getClientMasterPin(saved.idclient)) !== null
      : Boolean(pin_code);
    return this.toCompteResponse(saved, true, typeCompte, hasPin);
  }

  async findAll() {
    const comptes = await this.repository.find();
    const typesById = await this.typeCompteMap();
    return comptes
      .filter((compte) => this.isMobileAllowed(typesById.get(compte.idtype)))
      .map((compte) =>
        this.toCompteResponse(compte, true, typesById.get(compte.idtype)),
      );
  }

  async findOne(id: number) {
    const compte = await this.repository.findOneBy({ idcompte: id });
    if (!compte) {
      return null;
    }

    const typeCompte = await this.findTypeCompte(compte.idtype);
    if (!this.isMobileAllowed(typeCompte)) {
      return null;
    }

    const hasPin = compte.idclient
      ? (await this.getClientMasterPin(compte.idclient)) !== null
      : false;

    return this.toCompteResponse(compte, true, typeCompte, hasPin);
  }

  async findByClient(idclient: number) {
    const comptes = await this.repository.find({
      where: { idclient },
      order: { idcompte: 'ASC' },
    });
    const typesById = await this.typeCompteMap();
    const hasPin = (await this.getClientMasterPin(idclient)) !== null;

    return comptes
      .filter((compte) => {
        const typeCompte = typesById.get(compte.idtype);
        return this.isMobileAllowed(typeCompte);
      })
      .map((compte) =>
        this.toCompteResponse(
          compte,
          true,
          typesById.get(compte.idtype),
          hasPin,
        ),
      );
  }

  async findByAgence(idag: number) {
    const comptes = await this.repository.find({
      where: { idag },
      order: { idcompte: 'ASC' },
    });
    const typesById = await this.typeCompteMap();
    return comptes
      .filter((compte) => this.isMobileAllowed(typesById.get(compte.idtype)))
      .map((compte) =>
        this.toCompteResponse(compte, true, typesById.get(compte.idtype)),
      );
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

    const typeCompte = await this.findTypeCompte(compte.idtype);
    this.assertMobileAllowed(typeCompte);

    const masterPin = compte.idclient
      ? await this.getClientMasterPin(compte.idclient)
      : compte.pin_code;

    if (!masterPin) {
      return this.toCompteResponse(compte, true, typeCompte, false);
    }

    if (masterPin === 'LOCKED') {
      throw new UnauthorizedException(
        'Code PIN deactive suite a plusieurs tentatives incorrectes. Veuillez contacter votre agence.',
      );
    }

    const isMatch = await bcrypt.compare(payload.pin_code, masterPin);
    if (!isMatch) {
      if (compte.idclient) {
        const attempts = (this.pinAttemptsMap.get(compte.idclient) || 0) + 1;
        if (attempts >= 5) {
          this.pinAttemptsMap.delete(compte.idclient);
          const firstCompte = await this.getFirstCompte(compte.idclient);
          if (firstCompte) {
            await this.repository.update(firstCompte.idcompte, {
              pin_code: 'LOCKED',
            });
          }
          throw new UnauthorizedException(
            'Code PIN deactive suite a 5 tentatives incorrectes. Veuillez contacter votre agence.',
          );
        } else {
          this.pinAttemptsMap.set(compte.idclient, attempts);
          throw new UnauthorizedException(
            `Code PIN incorrect. Tentative ${attempts}/5.`,
          );
        }
      }
      throw new UnauthorizedException('Code PIN incorrect');
    }

    if (compte.idclient) {
      this.pinAttemptsMap.delete(compte.idclient);
    }

    return this.toCompteResponse(compte, true, typeCompte, true);
  }

  async requestPinSetupOtp(payload: RequestPinOtpDto) {
    const compte = await this.repository.findOneBy({
      idcompte: payload.idcompte,
      idclient: payload.idclient,
    });

    if (!compte) {
      throw new NotFoundException('Compte introuvable pour ce client');
    }
    this.assertMobileAllowed(await this.findTypeCompte(compte.idtype));

    const masterPin = await this.getClientMasterPin(payload.idclient);
    if (masterPin) {
      if (masterPin === 'LOCKED') {
        throw new BadRequestException(
          'Ce code PIN est deactive. Veuillez contacter votre agence.',
        );
      }
      throw new BadRequestException('Le code PIN est deja configure');
    }

    const client = await this.clientRepository.findOneBy({
      idclient: payload.idclient,
    });
    if (!client) {
      throw new NotFoundException('Client introuvable');
    }

    // Check for 2-minute cooldown on OTP requests
    const lastOtp = await this.otpRepository.findOne({
      where: {
        idclient: payload.idclient,
        idcompte: payload.idcompte,
      },
      order: { created_at: 'DESC' },
    });

    if (lastOtp) {
      const now = new Date();
      const diffMs = now.getTime() - lastOtp.created_at.getTime();
      const cooldownMs = 2 * 60 * 1000; // 2 minutes cooldown
      if (diffMs < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - diffMs) / 1000);
        throw new BadRequestException(
          `Veuillez patienter ${remainingSeconds} secondes avant de demander un nouveau code OTP.`,
        );
      }
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

    const otpRecord = await this.otpRepository.save({
      idclient: payload.idclient,
      idcompte: payload.idcompte,
      otp_code_hash: otpHash,
      expires_at: expiresAt,
      attempts: 0,
      consumed_at: null,
    });

    let delivery: { channel: string; message: string; destination: string };
    try {
      delivery = await this.deliverPinOtp(client, otpCode);
    } catch (error) {
      // Un OTP non transmis ne doit pas imposer le delai de renouvellement.
      await this.otpRepository.delete(otpRecord.id);
      throw error;
    }

    return {
      success: true,
      delivery: delivery.channel,
      destination: delivery.destination,
      expires_at: expiresAt.toISOString(),
      message: delivery.message,
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
    this.assertMobileAllowed(await this.findTypeCompte(compte.idtype));

    const masterPin = await this.getClientMasterPin(payload.idclient);
    if (masterPin) {
      if (masterPin === 'LOCKED') {
        throw new BadRequestException(
          'Ce code PIN est deactive. Veuillez contacter votre agence.',
        );
      }
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

    // Increment attempts immediately to prevent race conditions
    const newAttempts = otpRecord.attempts + 1;
    await this.otpRepository.update(otpRecord.id, {
      attempts: newAttempts,
    });

    const isOtpValid = await bcrypt.compare(
      payload.otp_code,
      otpRecord.otp_code_hash,
    );
    if (!isOtpValid) {
      throw new UnauthorizedException('Code OTP invalide');
    }

    const pinHash = await this.hashPin(payload.pin_code);
    const firstCompte = await this.getFirstCompte(payload.idclient);
    if (!firstCompte) {
      throw new NotFoundException('Aucun compte trouve pour ce client');
    }
    await this.repository.update(firstCompte.idcompte, {
      pin_code: pinHash,
    });
    await this.otpRepository.update(otpRecord.id, {
      consumed_at: now,
    });

    const updated = await this.repository.findOneBy({
      idcompte: compte.idcompte,
    });
    const typeCompte = updated
      ? await this.findTypeCompte(updated.idtype)
      : undefined;
    return {
      success: true,
      compte: updated
        ? this.toCompteResponse(updated, false, typeCompte, true)
        : null,
      message: 'Code PIN configure avec succes',
    };
  }

  async update(id: number, payload: Partial<Compte>) {
    const pin_code =
      payload.pin_code !== undefined
        ? await this.hashPin(payload.pin_code)
        : undefined;

    let updatePayload = { ...payload };
    if (pin_code !== undefined) {
      delete (updatePayload as any).pin_code;
    }

    if (pin_code !== undefined) {
      const compte = await this.repository.findOneBy({ idcompte: id });
      if (compte && compte.idclient) {
        const firstCompte = await this.getFirstCompte(compte.idclient);
        if (firstCompte) {
          await this.repository.update(firstCompte.idcompte, { pin_code });
          if (firstCompte.idcompte === id) {
            updatePayload = { ...updatePayload, pin_code } as any;
          }
        } else {
          updatePayload = { ...updatePayload, pin_code } as any;
        }
      } else {
        updatePayload = { ...updatePayload, pin_code } as any;
      }
    }

    const result = await this.repository.update(id, updatePayload);
    const updated = await this.repository.findOneBy({ idcompte: id });
    const typeCompte = updated
      ? await this.findTypeCompte(updated.idtype)
      : undefined;

    const hasPin = updated?.idclient
      ? (await this.getClientMasterPin(updated.idclient)) !== null
      : updated
        ? Boolean(updated.pin_code)
        : false;

    return {
      ...result,
      compte: updated
        ? this.toCompteResponse(updated, true, typeCompte, hasPin)
        : null,
    };
  }

  remove(id: number) {
    return this.repository.delete(id);
  }

  private generateOtpCode() {
    return String(randomInt(100000, 1000000));
  }

  private async sendPinOtpEmail(
    to: string,
    otpCode: string,
    codeClient: string,
  ): Promise<'email' | 'console'> {
    const host = process.env.SMTP_HOST?.trim();
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();
    const from = process.env.SMTP_FROM?.trim() || user || 'no-reply@sbs.local';
    const secure =
      (process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true';

    const subject = 'Votre code OTP de configuration PIN';
    const text = [
      'Bonjour,',
      '',
      buildPinOtpMessage(codeClient, otpCode),
      '',
      "Si vous n'etes pas a l'origine de cette demande, ignorez cet email.",
    ].join('\n');

    if (!host || !user || !pass) {
      const isDev =
        process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
      const loggedOtp = isDev ? otpCode : '******';
      console.warn(
        `[PIN-OTP] SMTP non configure. OTP client ${codeClient} pour ${to}: ${loggedOtp}`,
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

  private async deliverPinOtp(client: Client, otpCode: string) {
    const phone = this.normalizePhone(client.telephone_principal);
    const email = client.email?.trim().toLowerCase();
    const codeClient = String(client.code_client || '').trim();
    if (!codeClient) {
      throw new BadRequestException('Code client introuvable');
    }
    const message = buildPinOtpMessage(codeClient, otpCode);

    if (phone) {
      const result = await this.smsService.sendSms(phone, message);
      if (!result.success) {
        throw new BadRequestException(
          `Echec envoi OTP via ${this.smsService.provider()}: ${result.error || 'erreur inconnue'}`,
        );
      }
      return {
        channel: 'sms',
        destination: this.maskPhone(phone),
        message: `Un code OTP a ete envoye par SMS au numero ${this.maskPhone(phone)}. Il expire dans 10 minutes.`,
      };
    }

    if (email) {
      const delivery = await this.sendPinOtpEmail(email, otpCode, codeClient);
      return {
        channel: delivery,
        destination: this.maskEmail(email),
        message: `Le code OTP a ete envoye a l adresse ${this.maskEmail(email)}. Il expire dans 10 minutes.`,
      };
    }

    throw new BadRequestException(
      'Aucun telephone ni email disponible. Contactez votre agence pour mettre a jour vos informations.',
    );
  }

  private normalizePhone(value?: string | null) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 8) {
      return '';
    }
    return digits;
  }

  private maskPhone(phone: string) {
    const digits = phone.replace(/\D/g, '');
    return digits.length <= 4 ? '****' : `******${digits.slice(-4)}`;
  }

  private maskEmail(email: string) {
    const [localPart, domain] = email.split('@');
    if (!localPart || !domain) return 'adresse masquee';
    return `${localPart.charAt(0)}***@${domain}`;
  }

  private async hashPin(pin?: string | null) {
    if (!pin) return undefined;
    const normalized = pin.trim();
    if (!/^\d{4,6}$/.test(normalized)) {
      throw new BadRequestException('Le code PIN doit contenir 4 a 6 chiffres');
    }
    return bcrypt.hash(normalized, 10);
  }

  private async typeCompteMap() {
    const types = await this.typeCompteRepository.find();
    return new Map(types.map((typeCompte) => [typeCompte.idtype, typeCompte]));
  }

  private findTypeCompte(idtype?: number) {
    if (!idtype) {
      return Promise.resolve(null);
    }
    return this.typeCompteRepository.findOneBy({ idtype });
  }

  private asEnabled(value: unknown, defaultValue: boolean) {
    if (value === undefined || value === null) {
      return defaultValue;
    }
    return Number(value) === 1;
  }

  private isMobileAllowed(typeCompte?: Typecompte | null) {
    return (
      this.asEnabled(typeCompte?.mobile_sync_enabled, false) &&
      this.asEnabled(typeCompte?.mobile_can_view, true)
    );
  }

  private assertMobileAllowed(typeCompte?: Typecompte | null) {
    if (!this.isMobileAllowed(typeCompte)) {
      throw new NotFoundException('Compte non disponible sur mobileclient');
    }
  }

  private toCompteResponse(
    compte: Compte,
    includeSensitive = true,
    typeCompte?: Typecompte | null,
    hasPinOverride?: boolean,
  ) {
    const { pin_code: _pin, ...safeCompte } = compte;
    const hasPin =
      hasPinOverride !== undefined ? hasPinOverride : Boolean(_pin);
    return {
      ...safeCompte,
      solde: includeSensitive
        ? safeCompte.solde
        : hasPin
          ? null
          : safeCompte.solde,
      has_pin: hasPin,
      libelle: typeCompte?.libelle ?? null,
      type_compte: typeCompte?.libelle ?? null,
      chapitre_comptable: typeCompte?.numero ?? null,
      mobile_sync_enabled: this.asEnabled(
        typeCompte?.mobile_sync_enabled,
        false,
      ),
      mobile_can_open: this.asEnabled(typeCompte?.mobile_can_open, false),
      mobile_can_view: this.asEnabled(typeCompte?.mobile_can_view, true),
      mobile_can_deposit: this.asEnabled(typeCompte?.mobile_can_deposit, true),
    };
  }

  async getRelevePdf(
    idcompte: number,
    idclient: number,
    dateDebut?: string,
    dateFin?: string,
  ): Promise<Buffer> {
    const compte = await this.repository.findOneBy({ idcompte, idclient });
    if (!compte) {
      throw new NotFoundException('Compte introuvable pour ce client');
    }

    const start = this.statementDate(dateDebut, false);
    const end = this.statementDate(dateFin, true);
    if (start && end && start > end) {
      throw new BadRequestException(
        'La date de debut doit preceder la date de fin.',
      );
    }

    if (start && end) {
      const durationInDays = (end.getTime() - start.getTime()) / 86_400_000;
      if (durationInDays > 31) {
        throw new BadRequestException(
          'La periode ne doit pas depasser 30 jours.',
        );
      }
    }

    return this.coreBankingStatementService.downloadStatement(
      idcompte,
      dateDebut,
      dateFin,
    );
  }

  private statementDate(value?: string, endOfDay = false): Date | null {
    const normalized = String(value || '').trim();
    if (!normalized) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      throw new BadRequestException(
        'Format de date invalide. Utilisez AAAA-MM-JJ.',
      );
    }
    const date = new Date(
      `${normalized}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`,
    );
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Date de releve invalide.');
    }
    return date;
  }

}
