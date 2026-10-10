import { describe, expect, it } from 'vitest';
import { assertLiveMode, isDemoSimulationEnabled } from './demoAdapter';

describe('CATMS-065 Demo Simulation Adapter Isolation', () => {
  it('disables in-memory simulation in final application profile', () => {
    expect(isDemoSimulationEnabled()).toBe(false);
  });

  it('rejects in-memory mutation attempts via assertLiveMode guard', () => {
    expect(() => assertLiveMode('addPatient')).toThrowError(
      /In-memory simulation is disabled in final profile \(CATMS-065\)/,
    );
    expect(() => assertLiveMode('addAppointment')).toThrowError(
      /Operation 'addAppointment' must be performed through the authoritative backend API/,
    );
    expect(() => assertLiveMode('postPayment')).toThrowError(
      /Operation 'postPayment' must be performed through the authoritative backend API/,
    );
    expect(() => assertLiveMode('saveClinicalRecord')).toThrowError(
      /Operation 'saveClinicalRecord' must be performed through the authoritative backend API/,
    );
  });
});
