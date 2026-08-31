import * as THREE from 'three';
import type { Keyframe } from '../types';
import { PlayerTokens } from './PlayerTokens';

export interface TimelineSnapshot {
  timestamp: number;
  action: string;
  commentary: string;
}

const DEMO_KEYFRAMES: Keyframe[] = [
  {
    timestamp: 0,
    action: 'SETUP',
    commentary: 'Defensa colocada en media pista',
    players: [
      { id: 'home-4', team: 'home', number: 4, name: 'MARTIN', position: { x: -4.8, y: 0.18, z: -3.6 } },
      { id: 'home-7', team: 'home', number: 7, name: 'SILVA', position: { x: -1.7, y: 0.18, z: -2.1 } },
      { id: 'home-11', team: 'home', number: 11, name: 'JONES', position: { x: -5.2, y: 0.18, z: 1.2 } },
      { id: 'home-23', team: 'home', number: 23, name: 'KIM', position: { x: -1.4, y: 0.18, z: 2.8 } },
      { id: 'home-30', team: 'home', number: 30, name: 'BROWN', position: { x: -5.1, y: 0.18, z: 5.0 } },
      { id: 'away-3', team: 'away', number: 3, name: 'WILLIAMS', position: { x: 4.8, y: 0.18, z: 3.6 } },
      { id: 'away-8', team: 'away', number: 8, name: 'LEE', position: { x: 1.7, y: 0.18, z: 2.1 } },
      { id: 'away-12', team: 'away', number: 12, name: 'DAVIS', position: { x: 5.2, y: 0.18, z: -1.2 } },
      { id: 'away-21', team: 'away', number: 21, name: 'HARRIS', position: { x: 1.4, y: 0.18, z: -2.8 } },
      { id: 'away-24', team: 'away', number: 24, name: 'SMITH', position: { x: 5.1, y: 0.18, z: -5.0 } },
    ],
  },
  {
    timestamp: 1800,
    action: 'DRIBBLE',
    commentary: 'MARTIN rompe la primera línea con bote',
    players: [
      { id: 'home-4', team: 'home', number: 4, name: 'MARTIN', position: { x: -2.3, y: 0.18, z: -2.2 } },
      { id: 'home-7', team: 'home', number: 7, name: 'SILVA', position: { x: -1.1, y: 0.18, z: -2.1 } },
      { id: 'home-11', team: 'home', number: 11, name: 'JONES', position: { x: -4.3, y: 0.18, z: 1.4 } },
      { id: 'home-23', team: 'home', number: 23, name: 'KIM', position: { x: -0.8, y: 0.18, z: 3.2 } },
      { id: 'home-30', team: 'home', number: 30, name: 'BROWN', position: { x: -4.8, y: 0.18, z: 5.0 } },
      { id: 'away-3', team: 'away', number: 3, name: 'WILLIAMS', position: { x: 3.7, y: 0.18, z: 3.5 } },
      { id: 'away-8', team: 'away', number: 8, name: 'LEE', position: { x: 1.8, y: 0.18, z: 2.0 } },
      { id: 'away-12', team: 'away', number: 12, name: 'DAVIS', position: { x: 4.5, y: 0.18, z: -1.1 } },
      { id: 'away-21', team: 'away', number: 21, name: 'HARRIS', position: { x: 1.0, y: 0.18, z: -2.7 } },
      { id: 'away-24', team: 'away', number: 24, name: 'SMITH', position: { x: 4.5, y: 0.18, z: -4.8 } },
    ],
  },
  {
    timestamp: 3600,
    action: 'PASS',
    commentary: 'Pase al perímetro y apertura de espacios',
    players: [
      { id: 'home-4', team: 'home', number: 4, name: 'MARTIN', position: { x: 0.8, y: 0.18, z: -1.6 } },
      { id: 'home-7', team: 'home', number: 7, name: 'SILVA', position: { x: -2.5, y: 0.18, z: -3.8 } },
      { id: 'home-11', team: 'home', number: 11, name: 'JONES', position: { x: -5.5, y: 0.18, z: 1.3 } },
      { id: 'home-23', team: 'home', number: 23, name: 'KIM', position: { x: 2.2, y: 0.18, z: 3.2 } },
      { id: 'home-30', team: 'home', number: 30, name: 'BROWN', position: { x: -4.8, y: 0.18, z: 5.0 } },
      { id: 'away-3', team: 'away', number: 3, name: 'WILLIAMS', position: { x: 4.0, y: 0.18, z: 3.4 } },
      { id: 'away-8', team: 'away', number: 8, name: 'LEE', position: { x: 2.3, y: 0.18, z: 1.6 } },
      { id: 'away-12', team: 'away', number: 12, name: 'DAVIS', position: { x: 4.4, y: 0.18, z: -1.0 } },
      { id: 'away-21', team: 'away', number: 21, name: 'HARRIS', position: { x: 0.8, y: 0.18, z: -2.5 } },
      { id: 'away-24', team: 'away', number: 24, name: 'SMITH', position: { x: 4.8, y: 0.18, z: -4.7 } },
    ],
  },
];

export class TimelineController {
  private readonly players: PlayerTokens;
  private readonly ball: THREE.Mesh;
  private readonly keyframes: Keyframe[] = DEMO_KEYFRAMES;
  private elapsed = 0;
  private playing = false;
  private loop = true;
  private speed = 1;
  private lastTime = performance.now();
  private readonly listeners = new Set<(snapshot: TimelineSnapshot) => void>();

  constructor(players: PlayerTokens, ball: THREE.Mesh) {
    this.players = players;
    this.ball = ball;
  }

  public update(now: number): void {
    const delta = Math.min(100, now - this.lastTime);
    this.lastTime = now;
    if (this.playing) this.elapsed += delta * this.speed;
    const duration = this.keyframes[this.keyframes.length - 1].timestamp;
    if (this.elapsed >= duration) {
      this.elapsed = this.loop ? this.elapsed % duration : duration;
      if (!this.loop) this.playing = false;
    }
    const [from, to] = this.findFramePair();
    const alpha = (this.elapsed - from.timestamp) / Math.max(1, to.timestamp - from.timestamp);
    if (this.playing) this.players.applyInterpolatedPositions(from, to, alpha);
    if (this.players.getBallOwnerId()) {
      this.players.syncBallToOwner(this.ball);
    } else {
      this.ball.position.set(0.8 + Math.sin(this.elapsed / 250) * 0.2, 0.32, -1.6 + Math.cos(this.elapsed / 250) * 0.15);
    }
    const snapshot = { timestamp: this.elapsed, action: to.action ?? '', commentary: to.commentary ?? '' };
    this.listeners.forEach((listener) => listener(snapshot));
  }

  public togglePlay(): void { this.playing = !this.playing; }
  public setPlaying(playing: boolean): void { this.playing = playing; }
  public setLoop(loop: boolean): void { this.loop = loop; }
  public setSpeed(speed: number): void { this.speed = speed; }
  public get isPlaying(): boolean { return this.playing; }
  public subscribe(listener: (snapshot: TimelineSnapshot) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  private findFramePair(): [Keyframe, Keyframe] {
    for (let index = 0; index < this.keyframes.length - 1; index += 1) {
      if (this.elapsed <= this.keyframes[index + 1].timestamp) return [this.keyframes[index], this.keyframes[index + 1]];
    }
    return [this.keyframes[this.keyframes.length - 2], this.keyframes[this.keyframes.length - 1]];
  }
}