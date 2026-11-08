import type { OfficeAgent, OfficeChannel, OfficeSnapshot } from '../src/shared.ts';
import type { RoomPlan, FloorPoint } from '../ui/layout.ts';

export interface LeisureSpot extends FloorPoint {
  id: string;
  facing: number;
  seated: boolean;
  y?: number;
  bubble: string;
  approach?: FloorPoint;
}
export interface ConferenceLayout {
  x: number;
  z: number;
  width: number;
  depth: number;
  door: FloorPoint;
  seats: (FloorPoint & { facing: number })[];
}
export interface Obstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
export interface ActivityGoal extends LeisureSpot {
  kind: 'desk' | 'lounge' | 'leisure' | 'meeting';
  roomId: string;
}
export const agentSeed = (id: string) =>
  [...id].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 7);

export function addCampusActivities(plan: RoomPlan, channels: OfficeChannel[] = []) {
  const capacity = Math.max(
    4,
    ...channels
      .filter((c) => c.agentIds.some((id) => plan.agents.some((a) => a.id === id)))
      .map((c) => c.agentIds.length),
  );
  const depth = Math.max(3.2, Math.ceil(capacity / 2) * 0.85 + 1.5),
    front = plan.minZ + 3.025;
  const x = plan.minX + 2.35,
    z = front - depth / 2;
  plan.conference = {
    x,
    z,
    width: 3.55,
    depth,
    door: { x, z: front },
    seats: Array.from({ length: capacity }, (_, i) => ({
      x: x + (i % 2 ? 1.12 : -1.12),
      z: z + (Math.floor(i / 2) - (Math.ceil(capacity / 2) - 1) / 2) * 0.85,
      facing: i % 2 ? -Math.PI / 2 : Math.PI / 2,
    })),
  };
  plan.minZ = front - depth - 0.375;
  plan.park = { minZ: plan.maxZ, maxZ: plan.maxZ + 3.6 };
  plan.maxZ = plan.park.maxZ;
  plan.depth = plan.maxZ - plan.minZ;
}
export function parkBenches(plan: RoomPlan) {
  const benches: FloorPoint[] = [];
  if (!plan.park) return benches;
  const cx = (plan.minX + plan.maxX) / 2;
  for (let x = plan.minX + 2; x < plan.maxX - 1.4; x += 2.8)
    if (Math.abs(x - cx) > 0.95) benches.push({ x, z: plan.park.maxZ - 0.85 });
  return benches;
}
export function campusLeisureSpots(plan: RoomPlan): LeisureSpot[] {
  if (!plan.park) return [];
  const spots: LeisureSpot[] = [];
  for (let i = 0; i < 3; i++)
    spots.push({
      id: `cafe-${i}`,
      x: plan.minX + 1.75 + i * 0.85,
      z: plan.amenityZ + 1.05,
      y: 0.2,
      facing: Math.PI,
      seated: true,
      bubble: 'Coffee break',
    });
  for (let i = 0; i < 2; i++)
    spots.push({
      id: `arcade-${i}`,
      x: plan.minX + 6 + i * 0.85,
      z: plan.amenityZ + 1.15,
      facing: Math.PI,
      seated: false,
      bubble: 'Playing',
    });
  for (const side of [-1, 1])
    spots.push({
      id: `tennis-${side}`,
      x: plan.maxX - 2.1 + side * 1.75,
      z: plan.amenityZ + 0.2,
      facing: (-side * Math.PI) / 2,
      seated: false,
      bubble: 'Playing',
    });
  parkBenches(plan).forEach((p, i) =>
    spots.push({
      ...p,
      id: `park-bench-${i}`,
      facing: Math.PI,
      seated: true,
      bubble: i % 2 ? 'Chatting' : 'Chilling',
    }),
  );
  for (let i = 0; i < 4; i++)
    spots.push({
      id: `park-path-${i}`,
      x: plan.minX + 1.8 + ((plan.width - 3.6) * i) / 3,
      z: plan.park.minZ + 1.35,
      facing: i % 2 ? Math.PI / 2 : -Math.PI / 2,
      seated: false,
      bubble: i % 2 ? 'Whispering' : 'Chilling',
    });
  for (const [id, seat] of plan.seats)
    spots.push({ ...seat, id: `lounge-${id}`, facing: 0, seated: true, bubble: 'Chilling' });
  return spots.map((s) =>
    s.seated
      ? { ...s, approach: { x: s.x, z: s.z + (s.id.startsWith('park-bench') ? -0.7 : 0.75) } }
      : s,
  );
}
export function campusObstacles(plan: RoomPlan): Obstacle[] {
  const out: Obstacle[] = [];
  const rect = (x: number, z: number, w: number, d: number) =>
    out.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  for (const d of plan.desks.values()) rect(d.x, d.z, 1.7, 0.9);
  for (const c of plan.couches) {
    rect(c.x, c.z, 3, 0.8);
    rect(c.x, c.z + 1.7, 1.65, 0.8);
  }
  rect(plan.minX + 2.6, plan.amenityZ + 0.05, 3.22, 0.95);
  for (const x of [plan.minX + 6, plan.minX + 6.85]) rect(x, plan.amenityZ + 0.4, 0.78, 0.7);
  rect(plan.maxX - 2.1, plan.amenityZ + 0.2, 2.76, 1.54);
  rect(0.5, plan.amenityZ - 1.75, 1.7, 0.4);
  rect(plan.maxX - 1.2, plan.amenityZ - 1.75, 1.5, 0.4);
  for (let x = plan.minX + 9; x < plan.maxX - 4; x += 4) rect(x, plan.amenityZ + 0.2, 1.5, 1.5);
  const c = plan.conference;
  if (c) {
    rect(c.x, c.z, 1.15, c.depth - 1.45);
    rect(c.x - c.width / 2, c.z, 0.07, c.depth);
    rect(c.x + c.width / 2, c.z, 0.07, c.depth);
    rect(c.x, c.z - c.depth / 2, c.width, 0.07);
    const span = (c.width - 1.1) / 2;
    rect(c.x - 0.55 - span / 2, c.door.z, span, 0.07);
    rect(c.x + 0.55 + span / 2, c.door.z, span, 0.07);
  }
  return out;
}
export function meetingAssignments(snapshot: OfficeSnapshot, plans: RoomPlan[]) {
  const result = new Map<string, OfficeChannel>(),
    reserved = new Set<string>();
  for (const channel of [...(snapshot.channels ?? [])]
    .filter((c) => c.active && c.agentIds.length >= 2)
    .sort((a, b) => a.id.localeCompare(b.id))) {
    if (channel.agentIds.some((id) => reserved.has(id))) continue;
    const preferred = snapshot.agents.find(
      (a) => a.id === [...channel.agentIds].sort()[0],
    )?.groupId;
    const available = plans.filter(
      (p) =>
        p.conference && p.conference.seats.length >= channel.agentIds.length && !result.has(p.id),
    );
    const room = available.find((p) => p.id === preferred) ?? available[0];
    if (!room) continue;
    result.set(room.id, channel);
    channel.agentIds.forEach((id) => reserved.add(id));
  }
  return result;
}
/** Ambient decisions are local-only and run at most once per second. */
export class ActivityDirector {
  private visits = new Map<
    string,
    { roomId: string; seconds: number; next: number; goal: ActivityGoal }
  >();
  readonly goals = new Map<string, ActivityGoal>();
  meetings = new Map<string, OfficeChannel>();
  private think = 0;
  update(snapshot: OfficeSnapshot, plans: RoomPlan[], delta = 0, force = false) {
    if (snapshot.connection !== 'connected') return this.goals;
    const movingTime = snapshot.config.reducedMotion ? 0 : Math.max(0, delta);
    for (const visit of this.visits.values()) visit.seconds += movingTime;
    this.think += movingTime;
    if (!force && this.think < 1) return this.goals;
    this.think = 0;
    this.meetings = meetingAssignments(snapshot, plans);
    const meetingGoals = new Map<string, ActivityGoal>();
    for (const [roomId, channel] of this.meetings) {
      const p = plans.find((p) => p.id === roomId)!;
      channel.agentIds
        .slice()
        .sort()
        .forEach((id, i) => {
          const s = p.conference!.seats[i];
          meetingGoals.set(id, {
            ...s,
            id: `meeting-${channel.id}-${id}`,
            kind: 'meeting',
            roomId,
            seated: true,
            bubble: '',
            approach: { x: s.x + Math.sign(s.x - p.conference!.x) * 0.3, z: s.z },
          });
        });
    }
    for (const id of this.visits.keys())
      if (!snapshot.agents.some((a) => a.id === id && a.state === 'idle' && !meetingGoals.has(id)))
        this.visits.delete(id);
    const used = new Set<string>();
    for (const v of this.visits.values()) used.add(v.roomId + ':' + v.goal.id);
    this.goals.clear();
    for (const agent of snapshot.agents) {
      const p = plans.find((p) => !p.kind && p.agents.some((a) => a.id === agent.id));
      if (!p) continue;
      const meeting = meetingGoals.get(agent.id);
      if (meeting) {
        this.goals.set(agent.id, meeting);
        continue;
      }
      if (agent.state !== 'idle') {
        const d = p.desks.get(agent.id) ?? { x: 0, z: 0 };
        this.goals.set(agent.id, {
          ...d,
          id: 'desk',
          kind: 'desk',
          roomId: p.id,
          seated: true,
          facing: Math.PI,
          bubble: '',
        });
        continue;
      }
      let visit = this.visits.get(agent.id);
      if (!visit || visit.roomId !== p.id) {
        const s = p.seats.get(agent.id) ?? { x: 0, z: 0 };
        visit = {
          roomId: p.id,
          seconds: 0,
          next: 20 + (agentSeed(agent.id) % 20),
          goal: {
            ...s,
            id: `lounge-${agent.id}`,
            kind: 'lounge',
            roomId: p.id,
            seated: true,
            facing: 0,
            bubble: 'Chilling',
            approach: { x: s.x, z: s.z + 0.75 },
          },
        };
        // Give a fresh page visible activity immediately, including a useful static
        // arrangement for reduced-motion users. Later visits still use the idle timer.
        const available = campusLeisureSpots(p).filter(
          (spot) => !spot.id.startsWith('lounge-') && !used.has(p.id + ':' + spot.id),
        );
        const ordinal = [...this.visits.values()].filter((v) => v.roomId === p.id).length;
        const zone = ['park-', 'cafe-', 'arcade-', 'tennis-'][ordinal % 4];
        const preferred = available.filter((spot) => spot.id.startsWith(zone));
        const choices = preferred.length ? preferred : available;
        if (choices.length)
          visit.goal = {
            ...choices[agentSeed(agent.id) % choices.length],
            kind: 'leisure',
            roomId: p.id,
          };
        this.visits.set(agent.id, visit);
        used.add(p.id + ':' + visit.goal.id);
      }
      if (visit.seconds >= visit.next && movingTime > 0) {
        const spots = campusLeisureSpots(p).filter(
            (s) => !s.id.startsWith('lounge-') || s.id === `lounge-${agent.id}`,
          ),
          start =
            (agentSeed(agent.id) + Math.floor(visit.seconds / 15)) % Math.max(1, spots.length);
        for (let i = 0; i < spots.length; i++) {
          const spot = spots[(start + i) % spots.length];
          if (spot.id === visit.goal.id || used.has(p.id + ':' + spot.id)) continue;
          used.delete(p.id + ':' + visit.goal.id);
          visit.goal = { ...spot, kind: 'leisure', roomId: p.id };
          used.add(p.id + ':' + spot.id);
          break;
        }
        visit.next =
          visit.seconds + Math.max(30, (p.width + p.depth) / 1.4) + (agentSeed(agent.id) % 20);
      }
      this.goals.set(agent.id, visit.goal);
    }
    return this.goals;
  }
}
export function ambientBubble(
  agent: OfficeAgent,
  goal: ActivityGoal | undefined,
  seconds: number,
  walking: boolean,
  connection: OfficeSnapshot['connection'],
) {
  if (
    connection !== 'connected' ||
    agent.state !== 'idle' ||
    !goal ||
    goal.kind === 'meeting' ||
    (seconds + (agentSeed(agent.id) % 17)) % 20 > 5
  )
    return null;
  return walking ? 'Strolling' : goal.bubble || 'Chilling';
}
