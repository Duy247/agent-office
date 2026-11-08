import type { FloorPoint, RoomPlan } from '../ui/layout.ts';
import { campusObstacles } from './activities.ts';

/** Cached floor grid; searches run only when a destination changes, never every frame. */
export class CampusNavigation {
  readonly step = 0.25;
  private width: number;
  private height: number;
  private blocked: Uint8Array;
  readonly plan: RoomPlan;
  constructor(plan: RoomPlan) {
    this.plan = plan;
    this.width = Math.ceil(plan.width / this.step) + 1;
    this.height = Math.ceil(plan.depth / this.step) + 1;
    this.blocked = new Uint8Array(this.width * this.height);
    const obstacles = campusObstacles(plan);
    for (let z = 0; z < this.height; z++)
      for (let x = 0; x < this.width; x++) {
        const p = this.point(z * this.width + x);
        this.blocked[z * this.width + x] = +(
          p.x < plan.minX + 0.16 ||
          p.x > plan.maxX - 0.16 ||
          p.z < plan.minZ + 0.16 ||
          p.z > plan.maxZ - 0.16 ||
          obstacles.some(
            (o) =>
              p.x > o.minX - 0.16 &&
              p.x < o.maxX + 0.16 &&
              p.z > o.minZ - 0.16 &&
              p.z < o.maxZ + 0.16,
          )
        );
      }
  }
  private point(id: number): FloorPoint {
    return {
      x: this.plan.minX + (id % this.width) * this.step,
      z: this.plan.minZ + Math.floor(id / this.width) * this.step,
    };
  }
  private cell(p: FloorPoint) {
    return (
      Math.round((p.z - this.plan.minZ) / this.step) * this.width +
      Math.round((p.x - this.plan.minX) / this.step)
    );
  }
  private nearest(p: FloorPoint) {
    const x = Math.round((p.x - this.plan.minX) / this.step),
      z = Math.round((p.z - this.plan.minZ) / this.step);
    let result = -1,
      distance = Infinity;
    for (let dz = -5; dz <= 5; dz++)
      for (let dx = -5; dx <= 5; dx++) {
        const xx = x + dx,
          zz = z + dz;
        if (xx < 0 || xx >= this.width || zz < 0 || zz >= this.height) continue;
        const id = zz * this.width + xx;
        if (this.blocked[id]) continue;
        const q = this.point(id),
          d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
        if (d < distance) {
          result = id;
          distance = d;
        }
      }
    return result;
  }
  clear(a: FloorPoint, b: FloorPoint) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (0.5 * this.step)));
    for (let i = 0; i <= steps; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / steps, z: a.z + ((b.z - a.z) * i) / steps },
        id = this.cell(p);
      if (
        p.x < this.plan.minX ||
        p.x > this.plan.maxX ||
        p.z < this.plan.minZ ||
        p.z > this.plan.maxZ ||
        id < 0 ||
        id >= this.blocked.length ||
        this.blocked[id]
      )
        return false;
    }
    return true;
  }
  path(from: FloorPoint, to: FloorPoint): FloorPoint[] | null {
    const start = this.nearest(from),
      end = this.nearest(to);
    if (start < 0 || end < 0) return null;
    const costs = new Float32Array(this.blocked.length).fill(Infinity),
      previous = new Int32Array(this.blocked.length).fill(-1),
      closed = new Uint8Array(this.blocked.length);
    const heap: { id: number; score: number }[] = [];
    const push = (item: { id: number; score: number }) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p].score <= item.score) break;
        heap[i] = heap[p];
        i = p;
      }
      heap[i] = item;
    };
    const pop = () => {
      const result = heap[0],
        last = heap.pop()!;
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let c = i * 2 + 1;
          if (c + 1 < heap.length && heap[c + 1].score < heap[c].score) c++;
          if (heap[c].score >= last.score) break;
          heap[i] = heap[c];
          i = c;
        }
        heap[i] = last;
      }
      return result;
    };
    const heuristic = (id: number) =>
      Math.abs((id % this.width) - (end % this.width)) +
      Math.abs(Math.floor(id / this.width) - Math.floor(end / this.width));
    costs[start] = 0;
    push({ id: start, score: heuristic(start) });
    while (heap.length) {
      const { id } = pop();
      if (closed[id]) continue;
      if (id === end) break;
      closed[id] = 1;
      for (const next of [id - 1, id + 1, id - this.width, id + this.width]) {
        if (
          next < 0 ||
          next >= costs.length ||
          this.blocked[next] ||
          closed[next] ||
          (Math.abs(next - id) === 1 &&
            Math.floor(next / this.width) !== Math.floor(id / this.width))
        )
          continue;
        const cost = costs[id] + 1;
        if (cost >= costs[next]) continue;
        costs[next] = cost;
        previous[next] = id;
        push({ id: next, score: cost + heuristic(next) });
      }
    }
    if (start !== end && previous[end] < 0) return null;
    const raw: FloorPoint[] = [];
    for (let id = end; id >= 0; id = previous[id]) {
      raw.push(this.point(id));
      if (id === start) break;
    }
    raw.reverse();
    // Keep endpoint approaches but remove grid stair-steps along unobstructed sight lines.
    const route = [raw[0]];
    let i = 0;
    while (i < raw.length - 1) {
      let next = raw.length - 1;
      while (next > i + 1 && !this.clear(raw[i], raw[next])) next--;
      route.push(raw[next]);
      i = next;
    }
    route.push(to);
    return route;
  }
}

export function campusLinks(plans: RoomPlan[]) {
  const rooms = plans.filter((p) => !p.kind && p.park);
  const outerX = Math.min(...rooms.map((p) => p.offsetX + p.minX)) - 0.55;
  const rows = new Map<number, RoomPlan[]>();
  for (const p of rooms) {
    const row = Math.round((p.offsetZ + p.minZ) * 1000) / 1000;
    rows.set(row, [...(rows.get(row) ?? []), p]);
  }
  const exits = new Map<string, { x: number; z: number; rowZ: number }>();
  const segments: { from: FloorPoint; to: FloorPoint }[] = [];
  for (const row of rows.values()) {
    const rowZ = Math.max(...row.map((p) => p.offsetZ + p.maxZ)) + 0.85;
    for (const p of row) {
      const exit = { x: p.offsetX + (p.minX + p.maxX) / 2, z: p.offsetZ + p.maxZ - 0.25, rowZ };
      exits.set(p.id, exit);
      segments.push({ from: { x: exit.x, z: exit.z }, to: { x: exit.x, z: rowZ } });
    }
    segments.push({
      from: { x: outerX, z: rowZ },
      to: { x: Math.max(...row.map((p) => exits.get(p.id)!.x)), z: rowZ },
    });
  }
  const zs = [...exits.values()].map((e) => e.rowZ);
  if (zs.length)
    segments.push({
      from: { x: outerX, z: Math.min(...zs) },
      to: { x: outerX, z: Math.max(...zs) },
    });
  return { outerX, exits, segments };
}
export function withCampusLinks(plans: RoomPlan[]): RoomPlan[] {
  if (plans.filter((p) => !p.kind && p.park).length < 2) return plans;
  const links = campusLinks(plans).segments,
    points = links.flatMap((s) => [s.from, s.to]);
  const minX = Math.min(...points.map((p) => p.x)) - 0.45,
    maxX = Math.max(...points.map((p) => p.x)) + 0.45,
    minZ = Math.min(...points.map((p) => p.z)) - 0.45,
    maxZ = Math.max(...points.map((p) => p.z)) + 0.45;
  return [
    ...plans,
    {
      kind: 'circulation',
      id: 'office:walkways',
      name: '',
      agents: [],
      minX,
      maxX,
      minZ,
      maxZ,
      width: maxX - minX,
      depth: maxZ - minZ,
      offsetX: 0,
      offsetZ: 0,
      amenityZ: 0,
      couches: [],
      desks: new Map(),
      seats: new Map(),
      links,
    },
  ];
}

export class CampusRouter {
  private grids = new Map<string, CampusNavigation>();
  readonly plans: RoomPlan[];
  constructor(plans: RoomPlan[]) {
    this.plans = plans;
    for (const p of plans) if (!p.kind && p.park) this.grids.set(p.id, new CampusNavigation(p));
  }
  /** Points are in world floor coordinates so agents can visit a different group's pod. */
  route(from: FloorPoint, to: FloorPoint, hostId: string): FloorPoint[] | null {
    const host = this.plans.find((p) => p.id === hostId),
      source = this.plans.find(
        (p) =>
          !p.kind &&
          p.park &&
          from.x >= p.offsetX + p.minX &&
          from.x <= p.offsetX + p.maxX &&
          from.z >= p.offsetZ + p.minZ &&
          from.z <= p.offsetZ + p.maxZ,
      );
    if (!host || !this.grids.has(host.id)) return null;
    const local = (p: RoomPlan, v: FloorPoint) => ({ x: v.x - p.offsetX, z: v.z - p.offsetZ });
    const world = (p: RoomPlan, v: FloorPoint) => ({ x: v.x + p.offsetX, z: v.z + p.offsetZ });
    if (source === host)
      return (
        this.grids
          .get(host.id)!
          .path(local(host, from), local(host, to))
          ?.map((p) => world(host, p)) ?? null
      );
    const { outerX, exits } = campusLinks(this.plans),
      end = exits.get(host.id)!;
    const route: FloorPoint[] = [];
    if (source) {
      const exit = exits.get(source.id)!;
      const path = this.grids.get(source.id)!.path(local(source, from), local(source, exit));
      if (!path) return null;
      route.push(
        ...path.map((p) => world(source, p)),
        { x: exit.x, z: exit.rowZ },
        { x: outerX, z: exit.rowZ },
      );
    } else {
      const row = [...exits.values()].sort(
        (a, b) => Math.abs(a.rowZ - from.z) - Math.abs(b.rowZ - from.z),
      )[0];
      route.push({ x: from.x, z: row.rowZ }, { x: outerX, z: row.rowZ });
    }
    route.push({ x: outerX, z: end.rowZ }, { x: end.x, z: end.rowZ }, { x: end.x, z: end.z });
    const path = this.grids.get(host.id)!.path(local(host, end), local(host, to));
    if (!path) return null;
    route.push(...path.map((p) => world(host, p)));
    return route;
  }
}
