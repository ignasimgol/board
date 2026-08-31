export type Team = 'home' | 'away' | 'goalkeeper';

export interface PlayerPosition {
  x: number;
  y: number;
  z: number;
}

export interface PlayerState {
  id: string;
  team: Team;
  number: number;
  name: string;
  position: PlayerPosition;
}

export interface Keyframe {
  timestamp: number;
  action?: string;
  commentary?: string;
  players: PlayerState[];
}
