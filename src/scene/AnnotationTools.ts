import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { TokenRecord } from './PlayerTokens';
import { PlayerTokens } from './PlayerTokens';

export type AnnotationMode = 'dribble' | 'pass' | 'cut' | 'screen' | 'shot' | 'handoff';
type ToolMode = AnnotationMode | 'move';

type AnnotationStyle = {
  label: string;
  color: number;
  dashed: boolean;
  curved: boolean;
  arrow: boolean;
};

const ANNOTATION_STYLES: Record<AnnotationMode, AnnotationStyle> = {
  dribble: { label: 'DRIBBLE', color: 0xd7f34a, dashed: false, curved: true, arrow: true },
  pass: { label: 'PASS', color: 0xffffff, dashed: true, curved: false, arrow: true },
  cut: { label: 'CUT', color: 0xffffff, dashed: false, curved: false, arrow: true },
  screen: { label: 'SCREEN', color: 0xff765b, dashed: false, curved: false, arrow: false },
  shot: { label: 'SHOT', color: 0xff765b, dashed: true, curved: true, arrow: true },
  handoff: { label: 'HANDOFF', color: 0x54c7d9, dashed: false, curved: true, arrow: true },
};

const SNAP_DISTANCE = 1.1;
const ANNOTATION_Y = 0.08;
const COURT_WIDTH = 28;
const COURT_DEPTH = 15;

export class AnnotationTools {
  private readonly root: HTMLElement;
  private readonly camera: THREE.Camera;
  private readonly domElement: HTMLCanvasElement;
  private readonly court: THREE.Mesh;
  private readonly controls: OrbitControls;
  private readonly players: PlayerTokens;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly annotations = new THREE.Group();
  private readonly toolbar: HTMLDivElement;
  private activeMode?: ToolMode;
  private drawing = false;
  private startPoint?: THREE.Vector3;
  private startToken?: TokenRecord;
  private preview?: THREE.Line;
  private movingAnnotation?: THREE.Group;
  private moveOffset = new THREE.Vector3();

  constructor(root: HTMLElement, camera: THREE.Camera, domElement: HTMLCanvasElement, court: THREE.Mesh, controls: OrbitControls, players: PlayerTokens) {
    this.root = root;
    this.camera = camera;
    this.domElement = domElement;
    this.court = court;
    this.controls = controls;
    this.players = players;
    this.annotations.name = 'tactical-annotations';
    this.toolbar = this.createToolbar();
    root.appendChild(this.toolbar);
    this.bindEvents();
  }

  public get object(): THREE.Group {
    return this.annotations;
  }

  public dispose(): void {
    this.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.domElement.removeEventListener('pointercancel', this.handlePointerUp);
    this.toolbar.remove();
    this.annotations.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material.dispose();
      }
    });
  }

  private createToolbar(): HTMLDivElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'annotation-toolbar';
    toolbar.setAttribute('aria-label', 'Acciones tácticas');
    const title = document.createElement('p');
    title.className = 'annotation-toolbar__title';
    title.textContent = 'ADD ACTIONS';
    toolbar.appendChild(title);

    (Object.keys(ANNOTATION_STYLES) as AnnotationMode[]).forEach((mode) => {
      const button = document.createElement('button');
      button.className = 'annotation-button';
      button.type = 'button';
      button.dataset.mode = mode;
      button.textContent = ANNOTATION_STYLES[mode].label;
      button.addEventListener('click', () => this.selectMode(mode));
      toolbar.appendChild(button);
    });
    const moveButton = document.createElement('button');
    moveButton.className = 'annotation-button annotation-button--move';
    moveButton.type = 'button';
    moveButton.dataset.mode = 'move';
    moveButton.textContent = 'MOVE';
    moveButton.addEventListener('click', () => this.selectMode('move'));
    toolbar.appendChild(moveButton);
    return toolbar;
  }

  private selectMode(mode: ToolMode): void {
    this.activeMode = this.activeMode === mode ? undefined : mode;
    this.removePreview();
    this.drawing = false;
    this.startPoint = undefined;
    this.startToken = undefined;
    this.toolbar.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.mode === this.activeMode);
    });
    this.domElement.classList.toggle('is-annotating', Boolean(this.activeMode && this.activeMode !== 'move'));
    this.domElement.classList.toggle('is-moving', this.activeMode === 'move');
  }

  private bindEvents(): void {
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

  private getCourtPoint(event: PointerEvent): THREE.Vector3 | undefined {
    this.setPointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.court)[0];
    return hit?.point.setY(ANNOTATION_Y);
  }

  private getNearestToken(point: THREE.Vector3): TokenRecord | undefined {
    let nearest: TokenRecord | undefined;
    let nearestDistance = SNAP_DISTANCE;
    for (const record of this.players.records) {
      const distance = record.mesh.position.distanceTo(point);
      if (distance < nearestDistance) {
        nearest = record;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.activeMode) return;
    if (this.activeMode === 'move') {
      this.beginAnnotationMove(event);
      return;
    }
    const point = this.getCourtPoint(event);
    if (!point) return;
    this.startToken = this.getNearestToken(point);
    this.startPoint = this.startToken?.mesh.position.clone().setY(ANNOTATION_Y) ?? point.clone();
    this.drawing = true;
    this.controls.enabled = false;
    this.domElement.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.movingAnnotation) {
      const point = this.getCourtPoint(event);
      if (point) {
        const nextPosition = point.clone().add(this.moveOffset);
        this.movingAnnotation.position.x = THREE.MathUtils.clamp(nextPosition.x, -COURT_WIDTH / 2, COURT_WIDTH / 2);
        this.movingAnnotation.position.z = THREE.MathUtils.clamp(nextPosition.z, -COURT_DEPTH / 2, COURT_DEPTH / 2);
      }
      return;
    }
    if (!this.drawing || !this.startPoint || !this.activeMode) return;
    const point = this.getCourtPoint(event);
    if (!point) return;
    const endToken = this.getNearestToken(point);
    const endPoint = endToken?.mesh.position.clone().setY(ANNOTATION_Y) ?? point;
    this.removePreview();
    this.preview = this.createLine(this.startPoint, endPoint, ANNOTATION_STYLES[this.activeMode], true);
    this.annotations.add(this.preview);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.movingAnnotation) {
      if (this.domElement.hasPointerCapture(event.pointerId)) this.domElement.releasePointerCapture(event.pointerId);
      this.movingAnnotation = undefined;
      this.controls.enabled = true;
      return;
    }
    if (!this.drawing || !this.startPoint || !this.activeMode) return;
    const point = this.getCourtPoint(event);
    const endToken = point ? this.getNearestToken(point) : undefined;
    const endPoint = endToken?.mesh.position.clone().setY(ANNOTATION_Y) ?? point;
    this.removePreview();
    if (endPoint && this.startPoint.distanceTo(endPoint) > 0.25) {
      this.annotations.add(this.createAnnotation(this.startPoint, endPoint, ANNOTATION_STYLES[this.activeMode], this.activeMode));
    }
    if (this.domElement.hasPointerCapture(event.pointerId)) this.domElement.releasePointerCapture(event.pointerId);
    this.drawing = false;
    this.startPoint = undefined;
    this.startToken = undefined;
    this.controls.enabled = true;
  };

  private removePreview(): void {
    if (!this.preview) return;
    this.annotations.remove(this.preview);
    this.preview.geometry.dispose();
    this.preview.material.dispose();
    this.preview = undefined;
  }

  private createLine(start: THREE.Vector3, end: THREE.Vector3, style: AnnotationStyle, isPreview: boolean): THREE.Line {
    const points = style.curved ? this.createCurvePoints(start, end) : [start, end];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = style.dashed
      ? new THREE.LineDashedMaterial({ color: style.color, dashSize: 0.28, gapSize: 0.16, transparent: true, opacity: isPreview ? 0.55 : 0.95 })
      : new THREE.LineBasicMaterial({ color: style.color, transparent: true, opacity: isPreview ? 0.55 : 0.95 });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 3;
    if (style.dashed) line.computeLineDistances();
    return line;
  }

  private createAnnotation(start: THREE.Vector3, end: THREE.Vector3, style: AnnotationStyle, mode: AnnotationMode): THREE.Group {
    const group = new THREE.Group();
    group.userData.annotationMode = mode;
    const line = this.createLine(start, end, style, false);
    line.userData.annotationGroup = group;
    group.add(line);
    if (style.arrow) {
      const points = style.curved ? this.createCurvePoints(start, end) : [start, end];
      const arrow = this.addArrow(end, points[points.length - 2], style.color);
      arrow.userData.annotationGroup = group;
      group.add(arrow);
    }
    return group;
  }

  private beginAnnotationMove(event: PointerEvent): void {
    const point = this.getCourtPoint(event);
    if (!point) return;
    this.setPointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.annotations.children, true)[0]?.object;
    const annotation = hit?.userData.annotationGroup as THREE.Group | undefined;
    if (!annotation) return;
    this.movingAnnotation = annotation;
    this.moveOffset.copy(annotation.position).sub(point);
    this.controls.enabled = false;
    this.domElement.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private createCurvePoints(start: THREE.Vector3, end: THREE.Vector3): THREE.Vector3[] {
    const midpoint = start.clone().lerp(end, 0.5);
    const direction = end.clone().sub(start);
    const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    midpoint.add(perpendicular.multiplyScalar(Math.min(1.1, direction.length() * 0.18)));
    const curve = new THREE.QuadraticBezierCurve3(start, midpoint, end);
    return curve.getPoints(20).map((point) => point.setY(ANNOTATION_Y));
  }

  private addArrow(end: THREE.Vector3, previous: THREE.Vector3, color: number): THREE.Mesh {
    const direction = end.clone().sub(previous).normalize();
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 12), new THREE.MeshBasicMaterial({ color }));
    arrow.position.copy(end);
    arrow.position.y = ANNOTATION_Y;
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    arrow.renderOrder = 4;
    return arrow;
  }
}
