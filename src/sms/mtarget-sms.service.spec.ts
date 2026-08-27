import { MTargetSmsService } from './mtarget-sms.service';

describe('MTargetSmsService', () => {
  const service = new MTargetSmsService();

  it('normalise les numeros camerounais au format E.164', () => {
    expect(service.formatPhoneNumber('699001122')).toBe('+237699001122');
    expect(service.formatPhoneNumber('00237699001122')).toBe(
      '+237699001122',
    );
    expect(service.formatPhoneNumber('abc')).toBe('');
  });

  it('accepte uniquement le code MTarget 0', () => {
    const accepted = service.parseResponse(
      '{"results":[{"code":"0","reason":"ACCEPTED","ticket":"sms-1"}]}',
      200,
    );
    expect(accepted).toMatchObject({
      success: true,
      provider: 'mtarget',
      messageId: 'sms-1',
    });

    const refused = service.parseResponse(
      '{"results":[{"code":"-11","reason":"Not enough credit"}]}',
      200,
    );
    expect(refused.success).toBe(false);
    expect(refused.error).toContain('-11');
  });

  it('refuse une reponse 2xx sans resultat MTarget exploitable', () => {
    const result = service.parseResponse('{"message":"ok"}', 200);
    expect(result.success).toBe(false);
  });
});
