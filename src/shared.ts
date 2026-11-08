export type OfficeState =
  'idle' | 'working' | 'queued' | 'question' | 'approval' | 'takeover' | 'failed' | 'unknown';
export interface OfficeAgent {
  id: string;
  name: string;
  title: string;
  provider: string;
  model: string;
  groupId: string;
  deskIndex: number;
  state: OfficeState;
  queueCount: number;
  activity: string;
  updatedAt: string | null;
  character: number;
  desk?: { x: number; y: number };
}
export interface OfficeSnapshot {
  source?: { id: string; label: string; mode: 'demo' | 'live' };
  connection: 'connecting' | 'connected' | 'disconnected' | 'sign-in-required';
  version: string | null;
  updatedAt: string | null;
  message: string;
  agents: OfficeAgent[];
  groups: { id: string; name: string }[];
  recent: { at: string; agentId: string; kind: string }[];
  config: { title: string; reducedMotion: boolean; logo?: OfficeLogo; boss?: BossProfile };
}
export interface BossProfile {
  name: string;
  gender: 'male' | 'female';
}
export interface OfficeLogo {
  url: string;
  width?: number;
  height?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
}
