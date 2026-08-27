import { Injectable, Logger } from '@nestjs/common';

export interface SmsSendResult {
  success: boolean;
  provider: 'mtarget' | 'ebs';
  messageId?: string;
  data?: unknown;
  error?: string;
}

@Injectable()
export class MTargetSmsService {
  private readonly logger = new Logger(MTargetSmsService.name);
  private readonly defaultBaseUrl =
    'https://api-public-2.mtarget.fr/messages';

  formatPhoneNumber(phone: string): string {
    const raw = String(phone || '').trim();
    if (!raw) return '';

    const hasInternationalPrefix = raw.startsWith('+') || raw.startsWith('00');
    let digits = raw.replace(/\D/g, '');
    if (!digits) return '';

    if (digits.startsWith('00')) digits = digits.substring(2);
    if (/^06\d{8}$/.test(digits)) digits = digits.substring(1);

    if (/^6\d{8}$/.test(digits)) {
      digits = `237${digits}`;
    } else if (!/^2376\d{8}$/.test(digits) && !hasInternationalPrefix) {
      return '';
    }

    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : '';
  }

  parseResponse(responseBody: string, httpStatus: number): SmsSendResult {
    let decoded: any;
    try {
      decoded = JSON.parse(responseBody);
    } catch {
      return {
        success: false,
        provider: 'mtarget',
        error: `Reponse MTarget invalide (HTTP ${httpStatus})`,
        data: responseBody,
      };
    }

    const result = Array.isArray(decoded?.results)
      ? decoded.results[0]
      : decoded;
    const code = String(result?.code ?? '').trim();
    const reason = String(result?.reason ?? decoded?.reason ?? '').trim();

    if (httpStatus < 200 || httpStatus >= 300 || code !== '0') {
      const details = [code && `[${code}]`, reason].filter(Boolean).join(' ');
      return {
        success: false,
        provider: 'mtarget',
        error: `MTarget a refuse le SMS${details ? ` ${details}` : ''}`,
        data: decoded,
      };
    }

    const messageId =
      result?.ticket ??
      result?.msg_id ??
      decoded?.ticket ??
      decoded?.msg_id ??
      decoded?.messageId;

    return {
      success: true,
      provider: 'mtarget',
      messageId:
        typeof messageId === 'string' || typeof messageId === 'number'
          ? String(messageId)
          : undefined,
      data: decoded,
    };
  }

  async sendSms(
    to: string,
    message: string,
    sender?: string,
  ): Promise<SmsSendResult> {
    const username =
      process.env.MTARGET_USERNAME?.trim() || process.env.SMS_USER?.trim();
    const password =
      process.env.MTARGET_PASSWORD?.trim() || process.env.SMS_PASSWORD?.trim();
    const serviceId = process.env.MTARGET_SERVICE_ID?.trim();
    const formattedPhone = this.formatPhoneNumber(to);
    const cleanMessage = String(message || '').trim();

    if (!username || !password) {
      return {
        success: false,
        provider: 'mtarget',
        error: 'Identifiants MTarget non configures',
      };
    }
    if (!formattedPhone) {
      return {
        success: false,
        provider: 'mtarget',
        error: 'Numero destinataire invalide',
      };
    }
    if (!cleanMessage) {
      return {
        success: false,
        provider: 'mtarget',
        error: 'Message SMS vide',
      };
    }

    const configuredSender = String(
      sender ||
        process.env.MTARGET_DEFAULT_SENDER ||
        process.env.MTARGET_SENDER ||
        '',
    ).trim();
    if (configuredSender && !/^[A-Za-z0-9]{1,11}$/.test(configuredSender)) {
      return {
        success: false,
        provider: 'mtarget',
        error:
          'Le sender MTarget doit contenir au maximum 11 caracteres alphanumeriques',
      };
    }

    const endpoint = this.resolveEndpoint();
    if (!endpoint) {
      return {
        success: false,
        provider: 'mtarget',
        error: 'URL MTarget invalide ou non securisee',
      };
    }

    const body = new URLSearchParams({
      username,
      password,
      msisdn: formattedPhone,
      msg: cleanMessage,
    });
    if (serviceId) body.set('serviceid', serviceId);
    if (configuredSender) body.set('sender', configuredSender);

    const timeoutMs = Math.max(
      1000,
      Math.min(Number(process.env.MTARGET_TIMEOUT_MS || 45000), 120000),
    );
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      this.logger.log(
        `Envoi MTarget vers ${formattedPhone} (sender: ${configuredSender || 'defaut'})`,
      );
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Accept: 'application/json',
        },
        body,
        signal: controller.signal,
      });
      const result = this.parseResponse(await response.text(), response.status);
      if (!result.success) this.logger.error(result.error);
      return result;
    } catch (error: any) {
      const detail =
        error?.name === 'AbortError'
          ? 'Delai de reponse MTarget depasse'
          : error?.message || 'Erreur reseau MTarget';
      this.logger.error(detail);
      return { success: false, provider: 'mtarget', error: detail };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private resolveEndpoint(): string {
    let configured =
      process.env.MTARGET_BASE_URL?.trim() || this.defaultBaseUrl;
    configured = configured.replace(/\/+$/, '');
    if (!configured.endsWith('/messages')) configured += '/messages';

    try {
      const url = new URL(configured);
      return url.protocol === 'https:' ? url.toString() : '';
    } catch {
      return '';
    }
  }
}
