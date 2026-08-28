
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PlayerState, Team } from '../types';

const COURT_WIDTH = 28;
const COURT_DEPTH = 15;
const TOKEN_RADIUS = 0.42;
const TOKEN_HEIGHT = 0.18;
const TOKEN_Y = 0.18;

const INITIAL_PLAYERS: PlayerState[] = [
  { id: 'home-4', team: 'home', number: 4, name: 'MARTIN', position: { x: -4.8, y: TOKEN_Y, z: -3.6 } },
  { id: 'home-7', team: 'home', number: 7, name: 'SILVA', position: { x: -1.7, y: TOKEN_Y, z: -2.1 } },
  { id: 'home-11', team: 'home', number: 11, name: 'JONES', position: { x: -5.2, y: TOKEN_Y, z: 1.2 } },
  { id: 'home-23', team: 'home', number: 23, name: 'KIM', position: { x: -1.4, y: TOKEN_Y, z: 2.8 } },
  { id: 'home-30', team: 'home', number: 30, name: 'BROWN', position: { x: -5.1, y: TOKEN_Y, z: 5.0 } },
  { id: 'away-3', team: 'away', number: 3, name: 'WILLIAMS', position: { x: 4.8, y: TOKEN_Y, z: 3.6 } },
  { id: 'away-8', team: 'away', number: 8, name: 'LEE', position: { x: 1.7, y: TOKEN_Y, z: 2.1 } },
  { id: 'away-12', team: 'away', number: 12, name: 'DAVIS', position: { x: 5.2, y: TOKEN_Y, z: -1.2 } },
  { id: 'away-21', team: 'away', number: 21, name: 'HARRIS', position: { x: 1.4, y: TOKEN_Y, z: -2.8 } },
  { id: 'away-24', team: 'away', number: 24, name: 'SMITH', position: { x: 5.1, y: TOKEN_Y, z: -5.0 } },
];

export const TEAM_COLORS: Record<Team, string> = {
  home: '#e9f15a',
  away: '#54c7d9',
  goalkeeper: '#ff765b',
};

export type TokenRecord = {
  player: PlayerState;
  mesh: THREE.Mesh;
  label: HTMLDivElement;
  faceTexture: THREE.CanvasTexture;
};

export class PlayerTokens {
  private readonly root: HTMLElement;
  private readonly camera: THREE.Camera;
  private readonly domElement: HTMLCanvasElement;
  private readonly court: THREE.Mesh;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly dragOffset = new THREE.Vector3();
  private readonly tokens = new Map<string, TokenRecord>();
  private readonly tokenGroup = new THREE.Group();
  private draggedToken?: TokenRecord;
  private isDragging = false;

  constructor(root: HTMLElement, camera: THREE.Camera, domElement: HTMLCanvasElement, court: THREE.Mesh, controls: OrbitControls) {
    this.root = root;
    this.camera = camera;
    this.domElement = domElement;
    this.court = court;
    this.controls = controls;
    this.tokenGroup.name = 'player-tokens';
    this.bindPointerEvents();
    INITIAL_PLAYERS.forEach((player) => this.addPlayer(player));
  }

  public get object(): THREE.Group {
    return this.tokenGroup;
  }

  public get players(): PlayerState[] {
    return [...this.tokens.values()].map(({ player }) => player);
  }

  public get records(): TokenRecord[] {
    return [...this.tokens.values()];
  }

  public addPlayer(player: PlayerState): void {
    if (this.tokens.has(player.id)) return;
    this.createPlayer(player);
  }

  public updatePlayer(id: string, changes: Pick<PlayerState, 'name' | 'number' | 'team'>): void {
    const record = this.tokens.get(id);
    if (!record) return;
    record.player.name = changes.name;
    record.player.number = changes.number;
    record.player.team = changes.team;
    const nextTexture = this.createFaceTexture(record.player);
    const materials = record.mesh.material as THREE.Material[];
    const faceMaterial = materials[1] as THREE.MeshBasicMaterial;
    faceMaterial.map?.dispose();
    faceMaterial.map = nextTexture;
    faceMaterial.needsUpdate = true;
    record.faceTexture = nextTexture;
    record.label.className = `player-label player-label--${changes.team}`;
    record.label.querySelector('strong')!.textContent = String(changes.number);
    record.label.querySelector('span')!.textContent = changes.name;
    (materials[0] as THREE.MeshStandardMaterial).color.set(TEAM_COLORS[changes.team]);
    (materials[0] as THREE.MeshStandardMaterial).emissive.set(TEAM_COLORS[changes.team]);
  }

  public removePlayer(id: string): void {
    const record = this.tokens.get(id);
    if (!record) return;
    this.tokenGroup.remove(record.mesh);
    record.mesh.geometry.dispose();
    (record.mesh.material as THREE.Material[]).forEach((material) => material.dispose());
    record.faceTexture.dispose();
    record.label.remove();
    this.tokens.delete(id);
  }

  public updateLabels(): void {
    const rootBounds = this.root.getBoundingClientRect();
    for (const record of this.tokens.values()) {
      const labelPosition = new THREE.Vector3();
      record.mesh.getWorldPosition(labelPosition).y += TOKEN_HEIGHT;
      const projected = labelPosition.project(this.camera);
      const x = (projected.x * 0.5 + 0.5) * rootBounds.width;
      const y = (-projected.y * 0.5 + 0.5) * rootBounds.height;
      const visible = projected.z > -1 && projected.z < 1;
      record.label.style.transform = `translate3d(${x}px, ${y - 12}px, 0) translateX(-50%)`;
      record.label.style.opacity = visible ? '1' : '0';
    }
  }

  public dispose(): void {
    this.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.domElement.removeEventListener('pointercancel', this.handlePointerUp);
    this.controls.enabled = true;
    for (const record of this.tokens.values()) {
      record.mesh.geometry.dispose();
      (record.mesh.material as THREE.Material).dispose();
      record.faceTexture.dispose();
      record.label.remove();
    }
  }

  private createPlayer(player: PlayerState): void {
    const sideMaterial = new THREE.MeshStandardMaterial({
      color: TEAM_COLORS[player.team],
      roughness: 0.38,
      metalness: 0.28,
      emissive: TEAM_COLORS[player.team],
      emissiveIntensity: 0.08,
    });
    const faceTexture = this.createFaceTexture(player);
    const faceMaterial = new THREE.MeshBasicMaterial({ map: faceTexture, transparent: true });
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(TOKEN_RADIUS, TOKEN_RADIUS * 0.94, TOKEN_HEIGHT, 32),
      [sideMaterial, faceMaterial, sideMaterial],
    );
    mesh.position.set(player.position.x, TOKEN_Y, player.position.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.playerId = player.id;
    this.tokenGroup.add(mesh);

    const label = document.createElement('div');
    label.className = `player-label player-label--${player.team}`;
    const number = document.createElement('strong');
    number.textContent = String(player.number);
    const name = document.createElement('span');
    name.textContent = player.name;
    label.append(number, name);
    this.root.appendChild(label);
    this.tokens.set(player.id, { player, mesh, label, faceTexture });
  }

  private createFaceTexture(player: PlayerState): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable.');

    context.fillStyle = TEAM_COLORS[player.team];
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(Math.PI);
    context.translate(-canvas.width / 2, -canvas.height / 2);
    context.fillStyle = '#081015';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '800 112px Barlow Condensed, sans-serif';
    context.fillText(String(player.number), 128, 112);
    context.font = '700 22px Space Mono, monospace';
    context.fillText(player.name, 128, 205);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  private bindPointerEvents(): void {
    this.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.domElement.addEventListener('pointercancel', this.handlePointerUp);
  }

  private setPointer(event: PointerEvent): void {
    const bounds = this.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.domElement.classList.contains('is-annotating')) return;
    this.setPointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects([...this.tokens.values()].map((record) => record.mesh));
    const hit = intersections[0]?.object;
    if (!hit) return;

    this.draggedToken = this.tokens.get(hit.userData.playerId as string);
    if (!this.draggedToken) return;
    const courtHit = this.raycaster.intersectObject(this.court)[0];
    if (courtHit) this.dragOffset.copy(this.draggedToken.mesh.position).sub(courtHit.point);
    this.isDragging = true;
    this.controls.enabled = false;
    this.domElement.setPointerCapture(event.pointerId);
    this.domElement.classList.add('is-dragging');
    this.draggedToken.label.classList.add('is-selected');
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.isDragging || !this.draggedToken) return;
    this.setPointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const courtHit = this.raycaster.intersectObject(this.court)[0];
    if (!courtHit) return;
    const position = courtHit.point.add(this.dragOffset);
    this.draggedToken.mesh.position.set(
      THREE.MathUtils.clamp(position.x, -COURT_WIDTH / 2 + TOKEN_RADIUS, COURT_WIDTH / 2 - TOKEN_RADIUS),
      TOKEN_Y,
      THREE.MathUtils.clamp(position.z, -COURT_DEPTH / 2 + TOKEN_RADIUS, COURT_DEPTH / 2 - TOKEN_RADIUS),
    );
    this.draggedToken.player.position.x = this.draggedToken.mesh.position.x;
    this.draggedToken.player.position.z = this.draggedToken.mesh.position.z;
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (!this.isDragging) return;
    if (this.domElement.hasPointerCapture(event.pointerId)) this.domElement.releasePointerCapture(event.pointerId);
    this.isDragging = false;
    this.controls.enabled = true;
    this.domElement.classList.remove('is-dragging');
    this.draggedToken?.label.classList.remove('is-selected');
    this.draggedToken = undefined;
  };
}
