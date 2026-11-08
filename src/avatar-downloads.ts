import { createHash } from 'node:crypto';
import { imageMimes, validAvatarImage, type AvatarImage } from './avatars.ts';

/** Only bounded image downloads explicitly requested by the office are accepted. No disk writes. */
export class AvatarDownloads {
  private waiters = new Map<
    string,
    {
      resolve: (image: AvatarImage) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private transfers = new Map<
    string,
    { bytes: Buffer; received: number; hash: string; mime: string; done: boolean; at: number }
  >();
  receive(data: string | Buffer, requested: boolean, send: (frame: unknown) => void) {
    for (const [id, t] of this.transfers) if (Date.now() - t.at > 30_000) this.transfers.delete(id);
    if (typeof data === 'string') {
      const f = JSON.parse(data);
      if (
        f.version !== 2 ||
        typeof f.transferId !== 'string' ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(f.transferId)
      )
        throw new Error('Invalid avatar transfer.');
      if (f.type === 'file-open') {
        if (
          !requested ||
          this.transfers.size >= 4 ||
          !Number.isInteger(f.size) ||
          f.size < 1 ||
          f.size > 2 * 1024 * 1024 ||
          !imageMimes.includes(f.mimeType) ||
          !/^[a-f0-9]{64}$/.test(f.sha256)
        )
          throw new Error('Unrequested or invalid avatar image.');
        this.transfers.set(f.transferId, {
          bytes: Buffer.alloc(f.size),
          received: 0,
          hash: f.sha256,
          mime: f.mimeType,
          done: false,
          at: Date.now(),
        });
        send({ version: 2, type: 'file-ack', transferId: f.transferId, receivedThrough: 0 });
      } else if (f.type === 'file-complete') {
        const t = this.transfers.get(f.transferId);
        if (
          !t ||
          t.received !== t.bytes.length ||
          createHash('sha256').update(t.bytes).digest('hex') !== t.hash ||
          !validAvatarImage({ bytes: t.bytes, mimeType: t.mime })
        )
          throw new Error('Avatar image verification failed.');
        t.done = true;
        const waiter = this.waiters.get(f.transferId);
        if (waiter) {
          clearTimeout(waiter.timer);
          this.waiters.delete(f.transferId);
          waiter.resolve(this.take(f.transferId)!);
        }
      } else if (f.type === 'file-cancel') this.transfers.delete(f.transferId);
      else throw new Error('Unsupported avatar transfer control.');
    } else {
      if (data.length < 11 || data[0] !== 2 || data[1] < 1 || data.length <= data[1] + 10)
        throw new Error('Invalid avatar chunk.');
      const id = data.toString('utf8', 2, 2 + data[1]);
      const offset = data.readBigUInt64BE(2 + data[1]);
      const t = this.transfers.get(id),
        chunk = data.subarray(10 + data[1]);
      if (
        !t ||
        t.done ||
        offset !== BigInt(t.received) ||
        t.received + chunk.length > t.bytes.length
      )
        throw new Error('Invalid avatar chunk sequence.');
      chunk.copy(t.bytes, t.received);
      t.received += chunk.length;
      t.at = Date.now();
      send({ version: 2, type: 'file-ack', transferId: id, receivedThrough: t.received });
    }
  }
  take(id: string): AvatarImage | undefined {
    const t = this.transfers.get(id);
    if (!t?.done) return;
    this.transfers.delete(id);
    return { bytes: t.bytes, mimeType: t.mime };
  }
  wait(id: string): Promise<AvatarImage> {
    const ready = this.take(id);
    if (ready) return Promise.resolve(ready);
    if (this.waiters.size >= 4 || this.waiters.has(id))
      return Promise.reject(new Error('Avatar download limit exceeded.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id);
        this.transfers.delete(id);
        reject(new Error('Avatar download timed out.'));
      }, 12_000);
      this.waiters.set(id, { resolve, reject, timer });
    });
  }
  clear() {
    this.transfers.clear();
    for (const w of this.waiters.values()) {
      clearTimeout(w.timer);
      w.reject(new Error('Avatar download closed.'));
    }
    this.waiters.clear();
  }
}
