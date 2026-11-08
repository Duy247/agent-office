import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { projectRoot } from '../config.ts';
import type { OfficeSnapshot } from '../shared.ts';
import type { OfficeConnector } from './types.ts';
export function jsonFileConnector(options: Record<string, unknown>): OfficeConnector {
  return {
    async start({ signal, emit }) {
      const path = resolve(
        projectRoot,
        typeof options.path === 'string' ? options.path : 'examples/status.json',
      );
      let previous: OfficeSnapshot = {
        connection: 'connecting',
        version: null,
        updatedAt: null,
        message: 'Reading status file',
        agents: [],
        groups: [],
        recent: [],
        config: { title: '', reducedMotion: false },
      };
      while (!signal.aborted) {
        try {
          const input = JSON.parse(await readFile(path, 'utf8'));
          if (!Array.isArray(input.agents) || !Array.isArray(input.groups))
            throw new Error('Invalid file');
          previous = {
            ...input,
            connection: 'connected',
            message: 'Status from local JSON file',
            source: { id: 'json-file', label: 'JSON file', mode: 'live' },
            recent: input.recent ?? [],
            config: input.config ?? { title: '', reducedMotion: false },
            version: null,
          };
          emit(previous);
        } catch {
          emit({
            ...previous,
            source: { id: 'json-file', label: 'JSON file', mode: 'live' },
            connection: 'disconnected',
            message: 'Cannot read a valid status file; showing last known state.',
          });
        }
        try {
          await setTimeout(1000, undefined, { signal });
        } catch {
          break;
        }
      }
    },
  };
}
