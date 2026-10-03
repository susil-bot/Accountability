import { describe, expect, it } from 'vitest';
import { destinationFor, homeFor } from './home';

describe('role routing', () => {
  it('sends each role to its own home', () => {
    expect(homeFor({ role: 'USER', onboarded: true })).toBe('/app/dashboard');
    expect(homeFor({ role: 'USER', onboarded: false })).toBe('/onboarding');
    expect(homeFor({ role: 'MENTOR', onboarded: true })).toBe('/mentor');
    expect(homeFor({ role: 'ADMIN', onboarded: true })).toBe('/admin');
  });

  it('keeps a requested page only inside the role’s area', () => {
    expect(destinationFor({ role: 'USER', onboarded: true }, '/app/calendar')).toBe('/app/calendar');
    expect(destinationFor({ role: 'USER', onboarded: true }, '/admin')).toBe('/app/dashboard');
    expect(destinationFor({ role: 'MENTOR', onboarded: true }, '/mentor/clients/detail?id=1')).toBe('/mentor/clients/detail?id=1');
    expect(destinationFor({ role: 'MENTOR', onboarded: true }, '/app/dashboard')).toBe('/mentor');
    expect(destinationFor({ role: 'ADMIN', onboarded: true }, '/mentor/prep?clientId=1')).toBe('/mentor/prep?clientId=1');
    expect(destinationFor({ role: 'ADMIN', onboarded: true }, 'https://evil.example')).toBe('/admin');
  });
});
