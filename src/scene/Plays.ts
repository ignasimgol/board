import type { PlayerState } from '../types';

export type AnnotationSnapshot = {
  mode: string;
  points: Array<{ x: number; y: number; z: number }>;
  startPlayerId?: string;
};

export type KeyframeSnapshot = {
  id: number;
  label: string;
  players: PlayerState[];
  ball: { x: number; y: number; z: number };
  annotations: AnnotationSnapshot[];
};

export type InterpolatedState = {
  players: Array<{ id: string; position: { x: number; y: number; z: number } }>;
  ball: { x: number; y: number; z: number };
  annotations: AnnotationSnapshot[];
};

type Listener = () => void;
const EventNames = ['changed', 'seek'] as const;
type EventName = typeof EventNames[number];

let nextId = 1;

export class Plays {
  private readonly captureScene: {
    getPlayers: () => PlayerState[];
    getBall: () => { x: number; y: number; z: number };
    getAnnotations: () => AnnotationSnapshot[];
    apply: (state: InterpolatedState) => void;
  };

  private readonly listeners: Record<EventName, Set<Listener>> = {
    changed: new Set(),
    seek: new Set(),
  };

  private readonly frames: KeyframeSnapshot[] = [];
  private current = -1;
  public fps = 4;
  public isPlaying = false;
  private lastFrameTimeMs = 0;

  constructor(
    captureScene: {
      getPlayers: () => PlayerState[];
      getBall: () => { x: number; y: number; z: number };
      getAnnotations: () => AnnotationSnapshot[];
      apply: (state: InterpolatedState) => void;
    },
  ) {
    this.captureScene = captureScene;
  }

  public get length(): number {
    return this.frames.length;
  }

  public get list(): readonly KeyframeSnapshot[] {
    return this.frames;
  }

  public get currentIndex(): number {
    return this.current;
  }

  public get currentFrame(): KeyframeSnapshot | undefined {
    return this.frames[this.current] ?? undefined;
  }

  public on(event: EventName, cb: Listener): () => void {
    this.listeners[event].add(cb);
    return () => this.listeners[event].delete(cb);
  }

  private emit(event: EventName): void {
    for (const cb of this.listeners[event]) cb();
  }

  private capture(labelOverride?: string): KeyframeSnapshot {
    const fallbackId = this.frames.length ? Math.max(...this.frames.map((f) => f.id)) + 1 : 1;
    return {
      id: fallbackId,
      label: labelOverride ?? `Frame ${fallbackId}`,
      players: this.captureScene.getPlayers().map((player) => ({
        ...player,
        position: { ...player.position },
      })),
      ball: { ...this.captureScene.getBall() },
      annotations: this.captureScene.getAnnotations().map((a) => ({
        mode: a.mode,
        startPlayerId: a.startPlayerId,
        points: a.points.map((p) => ({ ...p })),
      })),
    };
  }

  public addSnapshot(label?: string): number {
    this.cancelPreview();
    const frame = this.capture(label ?? `Frame ${this.frames.length + 1}`);
    frame.id = nextId++;
    if (this.current < 0) {
      this.frames.push(frame);
      this.current = 0;
    } else {
      this.frames.splice(this.current + 1, 0, frame);
      this.current += 1;
    }
    this.emit('changed');
    this.emit('seek');
    return this.current;
  }

  public duplicateAt(index: number): number {
    if (index < 0 || index >= this.frames.length) return -1;
    const src = this.frames[index];
    const copy: KeyframeSnapshot = JSON.parse(JSON.stringify(src));
    copy.id = nextId++;
    copy.label = `${src.label} (copy)`;
    this.frames.splice(index + 1, 0, copy);
    if (this.current >= index + 1) this.current += 1;
    this.emit('changed');
    this.emit('seek');
    return index + 1;
  }

  public deleteAt(index: number): void {
    if (index < 0 || index >= this.frames.length) return;
    this.cancelPreview();
    this.frames.splice(index, 1);
    if (this.current >= this.frames.length) this.current = this.frames.length - 1;
    if (this.current < 0 && this.frames.length > 0) this.current = 0;
    this.emit('changed');
    this.emit('seek');
  }

  public clear(): void {
    this.cancelPreview();
    this.frames.length = 0;
    this.current = -1;
    this.isPlaying = false;
    this.emit('changed');
    this.emit('seek');
  }

  public goTo(index: number): void {
    if (this.frames.length === 0) return;
    const clamped = Math.max(0, Math.min(this.frames.length - 1, index));
    if (clamped === this.current) return;
    this.cancelPreview();
    this.current = clamped;
    this.emit('seek');
  }

  public next(): void {
    if (this.frames.length === 0) return;
    this.goTo(this.current + 1 >= this.frames.length ? 0 : this.current + 1);
  }

  public prev(): void {
    if (this.frames.length === 0) return;
    this.goTo(this.current - 1 < 0 ? this.frames.length - 1 : this.current - 1);
  }

  public setFps(fps: number): void {
    this.fps = Math.max(0.5, Math.min(60, fps));
    this.emit('changed');
  }

  public play(): void {
    if (this.frames.length < 2) return;
    this.isPlaying = true;
    this.lastFrameTimeMs = 0;
    this.emit('changed');
  }

  public pause(): void {
    this.isPlaying = false;
    this.lastFrameTimeMs = 0;
    this.emit('changed');
  }

  public toggle(): void {
    this.isPlaying ? this.pause() : this.play();
  }

  private cancelPreview(): void {
    // nothing — interpolation is transient and only written via apply
  }

  private interpolatePlayers(a: PlayerState[], b: PlayerState[], t: number): InterpolatedState['players'] {
    const byIdA = new Map(a.map((p) => [p.id, p.position]));
    const byIdB = new Map(b.map((p) => [p.id, p.position]));
    const ids = new Set([...byIdA.keys(), ...byIdB.keys()]);
    const out: InterpolatedState['players'] = [];
    for (const id of ids) {
      const posA = byIdA.get(id);
      const posB = byIdB.get(id);
      const position = posA && posB
        ? {
            x: posA.x + (posB.x - posA.x) * t,
            y: posA.y + (posB.y - posA.y) * t,
            z: posA.z + (posB.z - posA.z) * t,
          }
        : (posA ?? posB ?? { x: 0, y: 0, z: 0 });
      out.push({ id, position });
    }
    return out;
  }

  private lerpBall(a: KeyframeSnapshot['ball'], b: KeyframeSnapshot['ball'], t: number): InterpolatedState['ball'] {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
    };
  }

  public update(nowMs: number): void {
    if (!this.isPlaying) return;
    if (this.frames.length < 2) {
      this.isPlaying = false;
      return;
    }
    if (!this.lastFrameTimeMs) {
      this.lastFrameTimeMs = nowMs;
      return;
    }
    const frameDeltaMs = 1000 / this.fps;
    while (nowMs - this.lastFrameTimeMs >= frameDeltaMs) {
      this.lastFrameTimeMs += frameDeltaMs;
      if (this.current >= this.frames.length - 1) {
        this.current = 0;
        this.emit('seek');
      } else {
        this.current += 1;
        this.emit('seek');
      }
    }

    const cur = this.frames[this.current];
    const next = this.frames[(this.current + 1) % this.frames.length];
    if (!cur || !next) return;
    const localT = Math.min(1, (nowMs - this.lastFrameTimeMs) / frameDeltaMs);
    const state: InterpolatedState = {
      players: this.interpolatePlayers(cur.players, next.players, localT),
      ball: this.lerpBall(cur.ball, next.ball, localT),
      annotations: localT < 0.5 ? cur.annotations : next.annotations,
    };
    this.captureScene.apply(state);
  }

  public applyCurrentFrame(): void {
    const cur = this.frames[this.current];
    if (!cur) return;
    const state: InterpolatedState = {
      players: cur.players.map((p) => ({ id: p.id, position: { ...p.position } })),
      ball: { ...cur.ball },
      annotations: cur.annotations,
    };
    this.captureScene.apply(state);
  }
}
