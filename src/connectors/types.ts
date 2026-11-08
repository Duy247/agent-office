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
  avatar?: (
    id: string,
    version: string,
  ) => Promise<import('../avatars.ts').AvatarImage | undefined>;
  start: (context: ConnectorContext) => Promise<void>;
}
export type ConnectorFactory = (options: Record<string, unknown>) => OfficeConnector;
