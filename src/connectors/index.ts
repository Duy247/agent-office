import { demoConnector } from './demo.ts';
import { jsonFileConnector } from './json-file.ts';
import { openbotConnector } from './openbot.ts';
import type { ConnectorFactory } from './types.ts';
/** Register another read-only adapter here, then choose it in office.config.local.json. */
export const connectors: Record<string, ConnectorFactory> = {
  demo: () => demoConnector(),
  'json-file': jsonFileConnector,
  openbot: openbotConnector,
};
export function createConnector(type: string, options: Record<string, unknown> = {}) {
  const factory = connectors[type];
  if (!factory)
    throw new Error(`Unknown connector: ${type}. Register an adapter in src/connectors/index.ts.`);
  return factory(options);
}
