import { buildPinOtpMessage } from './comptes.service';

describe('PIN OTP message', () => {
  it('uses the fixed SBS text with the client code and OTP', () => {
    expect(buildPinOtpMessage('CLI-2026-001', '483920')).toBe(
      'Votre code OTP SBS pour configurer le PIN du compte CLI-2026-001 est: 483920. Il expire dans 10 minutes.',
    );
  });
});
