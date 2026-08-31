import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, randomUUID } from 'crypto';

const MAX_PDF_BYTES = 15 * 1024 * 1024;

@Injectable()
export class CoreBankingStatementService {
  async downloadStatement(
    sbsCompteId: number,
    dateDebut?: string,
    dateFin?: string,
  ): Promise<Buffer> {
    const baseUrl = String(process.env.CORE_BANKING_BASE_URL || '').trim();
    const secret = String(
      process.env.CORE_BANKING_JWT_SECRET || process.env.SBS_JWT_SECRET || '',
    ).trim();

    if (!baseUrl || !secret) {
      throw new ServiceUnavailableException(
        'Le service de releve bancaire n\'est pas configure.',
      );
    }

    let url: URL;
    try {
      url = new URL(
        `api/releve-compte/${encodeURIComponent(String(sbsCompteId))}`,
        `${baseUrl.replace(/\/+$/, '')}/`,
      );
    } catch {
      throw new ServiceUnavailableException(
        'Le service de releve bancaire n\'est pas configure.',
      );
    }

    if (
      url.protocol !== 'https:' &&
      !['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    ) {
      throw new ServiceUnavailableException(
        'La connexion au core banking doit utiliser HTTPS.',
      );
    }

    if (dateDebut) url.searchParams.set('date_debut', dateDebut);
    if (dateFin) url.searchParams.set('date_fin', dateFin);

    const timeoutMs = Math.min(
      Math.max(Number(process.env.CORE_BANKING_TIMEOUT_MS) || 20_000, 1_000),
      60_000,
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/pdf',
          Authorization: `Bearer ${this.createServiceToken(secret)}`,
        },
        redirect: 'error',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BadGatewayException(
          'Le core banking n\'a pas pu produire le releve demande.',
        );
      }

      const contentType = response.headers.get('content-type') || '';
      const announcedSize = Number(response.headers.get('content-length') || 0);
      if (
        !contentType.toLowerCase().includes('application/pdf') ||
        announcedSize > MAX_PDF_BYTES
      ) {
        throw new BadGatewayException(
          'Le core banking a retourne un releve invalide.',
        );
      }

      const pdf = Buffer.from(await response.arrayBuffer());
      if (pdf.length > MAX_PDF_BYTES || !pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        throw new BadGatewayException(
          'Le core banking a retourne un releve invalide.',
        );
      }

      return pdf;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GatewayTimeoutException(
          'Le core banking met trop de temps a produire le releve.',
        );
      }
      throw new BadGatewayException(
        'Le core banking est temporairement inaccessible.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private createServiceToken(secret: string): string {
    const now = Math.floor(Date.now() / 1000);
    const header = this.base64Url({ alg: 'HS256', typ: 'JWT' });
    const payload = this.base64Url({
      sub: 'apiclientsbs',
      iss: process.env.CORE_BANKING_JWT_ISSUER || 'sbsclient',
      aud: process.env.CORE_BANKING_JWT_AUDIENCE || 'collectapp',
      accountType: 'service',
      roles: ['SERVICE'],
      iat: now,
      nbf: now - 5,
      exp: now + 60,
      jti: randomUUID(),
    });
    const signature = createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    return `${header}.${payload}.${signature}`;
  }

  private base64Url(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }
}
