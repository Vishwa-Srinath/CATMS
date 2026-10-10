/**
 * src/context/demoAdapter.ts
 * Owner: Dev1 | Issue: CATMS-065
 *
 * Demo Simulation Adapter — Isolated and disabled in final profile.
 * Per CATMS-065 deliverables, business-rule mutations and simulation
 * logic have been eliminated from the primary application runtime.
 */

export interface DemoAdapterConfig {
  simulationEnabled: boolean;
  profile: 'final' | 'demo';
}

/**
 * Returns false in the final application profile.
 * In final mode, transactional and business-rule mutations cannot run without the real API and database.
 */
export function isDemoSimulationEnabled(): boolean {
  return false;
}

export function assertLiveMode(actionName: string, ...details: unknown[]): void {
  void details;
  if (isDemoSimulationEnabled()) return;
  throw new Error(
    `In-memory simulation is disabled in final profile (CATMS-065). Operation '${actionName}' must be performed through the authoritative backend API.`,
  );
}
