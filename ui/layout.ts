import type { OfficeAgent, OfficeSnapshot } from '../src/shared.ts';

export interface FloorPoint {
  x: number;
  z: number;
}
export interface RoomPlan {
  kind?: 'boss';
  id: string;
  name: string;
  agents: OfficeAgent[];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
  amenityZ: number;
  offsetX: number;
  offsetZ: number;
  couches: FloorPoint[];
  desks: Map<string, FloorPoint>;
  seats: Map<string, FloorPoint>;
}

// Add an outer row/column as the roster grows; existing slots never move.
export function gridCell(index: number): { x: number; z: number } {
  const slot = Math.max(0, Math.floor(index)),
    ring = Math.floor(Math.sqrt(slot)),
    offset = slot - ring * ring;
  return offset < ring ? { x: ring, z: offset } : { x: offset - ring, z: ring };
}
export function planRooms(snapshot: Pick<OfficeSnapshot, 'agents' | 'groups'>): RoomPlan[] {
  const groups = [...snapshot.groups];
  if (snapshot.agents.some((a) => a.groupId === 'unassigned'))
    groups.push({ id: 'unassigned', name: 'Shared studio' });
  if (!groups.length) groups.push({ id: 'empty', name: '' });
  const rooms = groups.map((group) => {
    const agents = snapshot.agents.filter((a) => a.groupId === group.id),
      desks = new Map<string, FloorPoint>(),
      seats = new Map<string, FloorPoint>(),
      couchMap = new Map<number, FloorPoint>();
    let minX = -5,
      maxX = 7,
      minZ = -4,
      maxZ = 3.2;
    for (const a of agents) {
      const cell = gridCell(a.deskIndex),
        desk = { x: 0.35 + cell.x * 2.65, z: -1.65 + cell.z * 2.5 };
      if (Number.isFinite(a.desk?.x) && Number.isFinite(a.desk?.y)) {
        desk.x = Math.max(-0.8, a.desk!.x / 80 - 5);
        desk.z = Math.max(-2.7, a.desk!.y / 70 - 4);
      }
      desks.set(a.id, desk);
      maxX = Math.max(maxX, desk.x + 1.8);
      maxZ = Math.max(maxZ, desk.z + 2.3);
      const couchSlot = Math.floor(a.deskIndex / 3),
        c = gridCell(couchSlot),
        couch = { x: -3 - c.x * 3.6, z: 0.3 + c.z * 3.5 };
      couchMap.set(couchSlot, couch);
      seats.set(a.id, { x: couch.x - 0.7 + (a.deskIndex % 3) * 0.7, z: couch.z + 0.05 });
      minX = Math.min(minX, couch.x - 1.9);
      maxZ = Math.max(maxZ, couch.z + 2.8);
    }
    // Retain a furnished lounge even before any agents exist.
    if (!couchMap.size) couchMap.set(0, { x: -3, z: 0.3 });
    const amenityZ = maxZ + 2;
    maxZ += 4.5;
    return {
      id: group.id,
      name: group.name,
      agents,
      minX,
      maxX,
      minZ,
      maxZ,
      width: maxX - minX,
      depth: maxZ - minZ,
      amenityZ,
      offsetX: 0,
      offsetZ: 0,
      couches: [...couchMap.values()],
      desks,
      seats,
    };
  });
  let rowZ = 0;
  for (let row = 0; row < rooms.length; row += 2) {
    const pair = rooms.slice(row, row + 2);
    let cursorX = 0;
    for (const room of pair) {
      room.offsetX = cursorX - room.minX;
      room.offsetZ = rowZ - room.minZ;
      cursorX += room.width + 2.5;
    }
    rowZ += Math.max(...pair.map((r) => r.depth)) + 2.5;
  }
  return rooms;
}
