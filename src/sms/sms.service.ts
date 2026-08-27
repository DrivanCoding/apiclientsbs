import { Injectable } from '@nestjs/common';
import { MTargetSmsService, SmsSendResult } from './mtarget-sms.service';

@Injectable()
export class SmsService {
  constructor(private readonly mtarget: MTargetSmsService) {}

  provider(): string {
    return String(process.env.SMS_PROVIDER || 'disabled').toLowerCase().trim();
  }

  async sendSms(to: string, message: string): Promise<SmsSendResult> {
    const provider = this.provider();
    if (provider === 'mtarget') return this.mtarget.sendSms(to, message);
    if (provider === 'ebs') return this.sendEbs(to, message);

    return {
      success: false,
      provider: 'ebs',
      error:
        provider === 'disabled' || provider === 'none'
          ? 'Envoi SMS desactive'
          : `Fournisseur SMS inconnu: ${provider}`,
    };
  }

  private async sendEbs(to: string, message: string): Promise<SmsSendResult> {
    const user =
      process.env.EBS_SMS_USER?.trim() || process.env.SMS_USER?.trim();
    const password =
      process.env.EBS_SMS_PASSWORD?.trim() ||
      process.env.SMS_PASSWORD?.trim();
    const senderID =
      process.env.EBS_SMS_SENDER_ID?.trim() ||
      process.env.SMS_SENDER_ID?.trim();
    const endpoint =
      process.env.EBS_SMS_API_URL?.trim() ||
      process.env.SMS_API_URL?.trim() ||
      'https://sms.ebs237.online/smsapi/sendSMS';

    if (!user || !password || !senderID) {
      return {
        success: false,
        provider: 'ebs',
        error: 'Configuration SMS EBS237 incomplete',
      };
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ user, password, senderID, phone: to, message }),
      });
      const text = await response.text();
      if (!response.ok || this.looksFailed(text)) {
        return {
          success: false,
          provider: 'ebs',
          error: `Echec EBS237 (HTTP ${response.status})`,
          data: text,
        };
      }
      return { success: true, provider: 'ebs', data: text };
    } catch (error: any) {
      return {
        success: false,
        provider: 'ebs',
        error: error?.message || 'Erreur reseau EBS237',
      };
    }
  }

  private looksFailed(raw: string): boolean {
    if (!raw.trim()) return true;
    try {
      const decoded = JSON.parse(raw);
      const status = String(decoded?.status ?? decoded?.statut ?? '').toLowerCase();
      const success = String(decoded?.success ?? '').toLowerCase();
      return ['error', 'failed', 'ko', '0'].includes(status) || success === 'false';
    } catch {
      return /error|erreur|failed|echec/i.test(raw);
    }
  }
}
