import type { OfficeSnapshot } from '../shared.ts';
export interface ConnectorContext {
  signal: AbortSignal;
  config: any;
  emit: (snapshot: OfficeSnapshot) => void;
  saveAppearance: (patch: {
    characters?: Record<string, number>;
    deskSlots?: Record<string, unknown>;
  }) => Promise<void>;
}
/** A connector observes a source and emits only normalized identity/status data. */
export interface OfficeConnector {
  start: (context: ConnectorContext) => Promise<void>;
}
export type ConnectorFactory = (options: Record<string, unknown>) => OfficeConnector;
