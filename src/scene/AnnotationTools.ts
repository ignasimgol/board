import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { TokenRecord } from './PlayerTokens';
import { PlayerTokens } from './PlayerTokens';

export type AnnotationMode = 'dribble' | 'pass' | 'cut' | 'screen' | 'shot' | 'handoff';
type ToolMode = AnnotationMode | 'move';
type DragMode = 'annotation' | 'start' | 'end' | 'middle';

type AnnotationStyle = {
  label: string;
  color: number;
  dashed: boolean;
  curved: boolean;
  arrow: boolean;
};

const ANNOTATION_STYLES: Record<AnnotationMode, AnnotationStyle> = {
  cut: { label: 'CUT', color: 0xffffff, dashed: false, curved: false, arrow: true },
  dribble: { label: 'DRIBBLE', color: 0xd7f34a, dashed: false, curved: true, arrow: true },
  pass: { label: 'PASS', color: 0xffffff, dashed: true, curved: false, arrow: true },
  screen: { label: 'SCREEN', color: 0xff765b, dashed: false, curved: false, arrow: false },
  shot: { label: 'SHOT', color: 0xff765b, dashed: true, curved: true, arrow: true },
  handoff: { label: 'HANDOFF', color: 0x54c7d9, dashed: false, curved: true, arrow: true },
};

const SNAP_DISTANCE = 1.1;
const ANNOTATION_Y = 0.08;
const COURT_WIDTH = 28;
const COURT_DEPTH = 15;
const HANDLE_RADIUS = 0.28;

export class AnnotationTools {
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
  private preview?: THREE.Group;
  private movingAnnotation?: THREE.Group;
  private dragMode: DragMode = 'annotation';
  private moveOffset = new THREE.Vector3();
  private moveStartPoint?: THREE.Vector3;
  private moveWasDragged = false;
  private selectedAnnotation?: THREE.Group;

  constructor(root: HTMLElement, camera: THREE.Camera, domElement: HTMLCanvasElement, court: THREE.Mesh, controls: OrbitControls, players: PlayerTokens) {
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
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material.dispose();
      }
    });
  }

  private createToolbar(): HTMLDivElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'annotation-toolbar is-minimized';
    toolbar.setAttribute('aria-label', 'Acciones tácticas');
    const title = document.createElement('p');
    title.className = 'annotation-toolbar__title';
    title.textContent = 'ADD ACTIONS';
    const minimizeButton = document.createElement('button');
    minimizeButton.className = 'panel-minimize';
    minimizeButton.type = 'button';
    minimizeButton.textContent = '+';
    minimizeButton.setAttribute('aria-label', 'Restaurar acciones');
    minimizeButton.addEventListener('click', () => {
      const minimized = toolbar.classList.toggle('is-minimized');
      minimizeButton.textContent = minimized ? '+' : '−';
      minimizeButton.setAttribute('aria-label', minimized ? 'Restaurar acciones' : 'Minimizar acciones');
    });
    const titleRow = document.createElement('div');
    titleRow.className = 'annotation-toolbar__title-row';
    titleRow.append(title, minimizeButton);
    toolbar.appendChild(titleRow);

    (['cut', 'dribble', 'pass', 'screen', 'shot', 'handoff'] as AnnotationMode[]).forEach((mode) => {
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
    this.clearSelection();
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
        this.handleAnnotationDrag(point);
      }
      return;
    }
    if (!this.drawing || !this.startPoint || !this.activeMode || this.activeMode === 'move') return;
    const mode = this.activeMode;
    const point = this.getCourtPoint(event);
    if (!point) return;
    const endToken = this.getNearestToken(point);
    const endPoint = endToken?.mesh.position.clone().setY(ANNOTATION_Y) ?? point;
    this.removePreview();
    this.preview = this.createAnnotationVisual([this.startPoint, endPoint], ANNOTATION_STYLES[mode], mode, true);
    this.annotations.add(this.preview);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.movingAnnotation) {
      const point = this.getCourtPoint(event);
      if (!point) return;
      if (this.moveStartPoint && point.distanceTo(this.moveStartPoint) > 0.08) this.moveWasDragged = true;
      if (this.domElement.hasPointerCapture(event.pointerId)) this.domElement.releasePointerCapture(event.pointerId);
      if (!this.moveWasDragged && this.dragMode === 'annotation') {
        this.addAnglePoint(this.movingAnnotation, point);
      }
      const annotation = this.movingAnnotation;
      this.movingAnnotation = undefined;
      this.moveStartPoint = undefined;
      this.controls.enabled = true;
      if (this.dragMode === 'start' || this.dragMode === 'end') {
        this.rebuildHandlesForSelected(annotation);
      }
      return;
    }
    if (!this.drawing || !this.startPoint || !this.activeMode || this.activeMode === 'move') return;
    const mode = this.activeMode;
    const point = this.getCourtPoint(event);
    const endToken = point ? this.getNearestToken(point) : undefined;
    const endPoint = endToken?.mesh.position.clone().setY(ANNOTATION_Y) ?? point;
    this.removePreview();
    if (endPoint && this.startPoint.distanceTo(endPoint) > 0.25) {
      const annotation = this.createAnnotation(this.startPoint, endPoint, ANNOTATION_STYLES[mode], mode);
      this.annotations.add(annotation);
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
    this.disposeObjectTree(this.preview);
    this.preview = undefined;
  }

  private disposeObjectTree(object: THREE.Object3D): void {
    const children = [...object.children];
    for (const child of children) {
      object.remove(child);
      this.disposeObjectTree(child);
    }
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material.dispose();
    }
  }

  private createLineGroup(endpoints: THREE.Vector3[], style: AnnotationStyle, isPreview: boolean): THREE.Group {
    const group = new THREE.Group();
    const points = style.curved ? this.createPathPoints(endpoints) : endpoints;

    const tubeBand = this.createTubeLine(points, style.color, isPreview ? 0.22 : 0.30, 0.22, isPreview);
    tubeBand.userData = { isBand: true };
    group.add(tubeBand);

    const coreGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const coreMaterial = style.dashed
      ? new THREE.LineDashedMaterial({
          color: style.color,
          dashSize: 0.28,
          gapSize: 0.16,
          transparent: true,
          opacity: isPreview ? 0.7 : 0.98,
          linewidth: 1,
        })
      : new THREE.LineBasicMaterial({
          color: style.color,
          transparent: true,
          opacity: isPreview ? 0.7 : 0.98,
          linewidth: 1,
        });
    const core = new THREE.Line(coreGeometry, coreMaterial);
    core.renderOrder = 3;
    if (style.dashed) core.computeLineDistances();

    group.add(core);

    return group;
  }

  private createTubeLine(pathPoints: THREE.Vector3[], color: number, opacity: number, thickness: number, isPreview: boolean): THREE.Mesh {
    const curve = new THREE.CatmullRomCurve3(pathPoints);
    curve.curveType = 'catmullrom';
    curve.tension = pathPoints.length === 2 ? 0 : 0.5;
    const geometry = new THREE.TubeGeometry(curve, Math.max(20, pathPoints.length * 6), thickness, 8, false);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = isPreview ? 2 : 2;
    return mesh;
  }

  private createAnnotationVisual(endpoints: THREE.Vector3[], style: AnnotationStyle, mode: AnnotationMode, isPreview: boolean): THREE.Group {
    const group = new THREE.Group();
    group.userData.annotationMode = mode;
    group.userData.points = endpoints.map((p) => p.clone());
    group.userData.isPreview = isPreview;

    const lineGroup = this.createLineGroup(endpoints, style, isPreview);
    lineGroup.children.forEach((child) => {
      (child as THREE.Object3D & { userData: { annotationGroup?: THREE.Group } }).userData.annotationGroup = group;
    });
    group.add(lineGroup);

    if (mode === 'screen') {
      const cap = this.createScreenCap(endpoints[0], endpoints[endpoints.length - 1], style.color);
      cap.userData.annotationGroup = group;
      group.add(cap);
    }
    if (style.arrow) {
      const pathPoints = style.curved ? this.createPathPoints(endpoints) : endpoints;
      const arrow = this.addArrow(pathPoints[pathPoints.length - 1], pathPoints[pathPoints.length - 2], style.color, isPreview);
      arrow.userData.annotationGroup = group;
      group.add(arrow);
    }
    return group;
  }

  private createAnnotation(start: THREE.Vector3, end: THREE.Vector3, style: AnnotationStyle, mode: AnnotationMode): THREE.Group {
    const points = [start.clone(), end.clone()];
    const group = this.createAnnotationVisual(points, style, mode, false);
    return group;
  }

  private createScreenCap(start: THREE.Vector3, end: THREE.Vector3, color: number): THREE.LineSegments {
    const direction = end.clone().sub(start).setY(0).normalize();
    const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(0.48);
    const cap = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([end.clone().sub(perpendicular), end.clone().add(perpendicular)]),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.98, linewidth: 1 }),
    );
    cap.renderOrder = 4;
    return cap;
  }

  private addArrow(end: THREE.Vector3, previous: THREE.Vector3, color: number, isPreview: boolean): THREE.Group {
    const arrowGroup = new THREE.Group();
    const direction = end.clone().sub(previous).setY(0).normalize();

    const haloLength = 0.72;
    const haloBase = 0.38;
    const haloGeometry = new THREE.ConeGeometry(haloBase, haloLength, 14);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: isPreview ? 0.2 : 0.3,
      depthTest: false,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.position.copy(end);
    halo.position.y = ANNOTATION_Y;
    const backOffset = direction.clone().multiplyScalar(haloLength * 0.05);
    halo.position.add(backOffset);
    halo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    halo.renderOrder = 3;
    arrowGroup.add(halo);

    const tipLength = 0.52;
    const tipBase = 0.22;
    const tipGeometry = new THREE.ConeGeometry(tipBase, tipLength, 16);
    const tipMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: isPreview ? 0.85 : 1,
      depthTest: false,
      depthWrite: false,
    });
    const tip = new THREE.Mesh(tipGeometry, tipMaterial);
    tip.position.copy(end);
    tip.position.y = ANNOTATION_Y;
    const tipBackOffset = direction.clone().multiplyScalar(tipLength * 0.45);
    tip.position.sub(tipBackOffset);
    tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    tip.renderOrder = 4;
    arrowGroup.add(tip);

    return arrowGroup;
  }

  private beginAnnotationMove(event: PointerEvent): void {
    const point = this.getCourtPoint(event);
    if (!point) return;
    this.setPointer(event);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    type HandleInfo = { annotation: THREE.Group; handleGroup: THREE.Group; handleType: 'start' | 'end' };
    const handleInfos: HandleInfo[] = [];
    const handleGroups: THREE.Group[] = [];
    this.annotations.children.forEach((child) => {
      const annotation = child as THREE.Group;
      if (annotation.userData.isPreview) return;
      (['startHandle', 'endHandle'] as const).forEach((key) => {
        const handleGroup = annotation.userData[key] as THREE.Group | undefined;
        if (handleGroup) {
          handleInfos.push({
            annotation,
            handleGroup,
            handleType: key === 'startHandle' ? 'start' : 'end',
          });
          handleGroups.push(handleGroup);
        }
      });
    });

    if (handleGroups.length > 0) {
      const hitResult = this.raycaster.intersectObjects(handleGroups, true)[0];
      if (hitResult) {
        let obj: THREE.Object3D | null = hitResult.object;
        let matchedInfo: HandleInfo | undefined;
        while (obj && !matchedInfo) {
          matchedInfo = handleInfos.find((info) => info.handleGroup === obj);
          obj = obj.parent;
        }
        if (matchedInfo) {
          this.setSelectedAnnotation(matchedInfo.annotation);
          this.movingAnnotation = matchedInfo.annotation;
          this.dragMode = matchedInfo.handleType;
          const points = matchedInfo.annotation.userData.points as THREE.Vector3[];
          const idx = matchedInfo.handleType === 'start' ? 0 : points.length - 1;
          this.moveOffset.copy(points[idx]).sub(point);
          this.moveStartPoint = point.clone();
          this.moveWasDragged = false;
          this.controls.enabled = false;
          this.domElement.setPointerCapture(event.pointerId);
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
      }
    }

    const allAnnotationChildren: THREE.Object3D[] = [];
    this.annotations.children.forEach((child) => {
      const annotation = child as THREE.Group;
      if (annotation.userData.isPreview) return;
      annotation.traverse((descendant) => {
        const d = descendant as THREE.Object3D & { userData: { annotationGroup?: THREE.Group; handleType?: string } };
        if (d.userData.annotationGroup && !d.userData.handleType) {
          allAnnotationChildren.push(descendant);
        }
      });
    });

    const hit = this.raycaster.intersectObjects(allAnnotationChildren, false)[0]?.object;
    const annotation = (hit as THREE.Object3D & { userData: { annotationGroup?: THREE.Group } } | undefined)?.userData.annotationGroup as THREE.Group | undefined;
    if (!annotation) {
      this.clearSelection();
      return;
    }

    this.setSelectedAnnotation(annotation);
    this.movingAnnotation = annotation;
    this.dragMode = 'annotation';
    this.moveOffset.copy(annotation.position).sub(point);
    this.moveStartPoint = point.clone();
    this.moveWasDragged = false;
    this.controls.enabled = false;
    this.domElement.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  private handleAnnotationDrag(point: THREE.Vector3): void {
    if (!this.movingAnnotation) return;
    const points = this.movingAnnotation.userData.points as THREE.Vector3[];
    const mode = this.movingAnnotation.userData.annotationMode as AnnotationMode;

    if (this.dragMode === 'start') {
      const next = point.clone().add(this.moveOffset);
      next.x = THREE.MathUtils.clamp(next.x, -COURT_WIDTH / 2, COURT_WIDTH / 2);
      next.z = THREE.MathUtils.clamp(next.z, -COURT_DEPTH / 2, COURT_DEPTH / 2);
      next.y = ANNOTATION_Y;
      points[0].copy(next);
      this.updateSelectedAnnotationHandles(this.movingAnnotation);
      this.rebuildAnnotationVisual(this.movingAnnotation, mode, points);
    } else if (this.dragMode === 'end') {
      const next = point.clone().add(this.moveOffset);
      next.x = THREE.MathUtils.clamp(next.x, -COURT_WIDTH / 2, COURT_WIDTH / 2);
      next.z = THREE.MathUtils.clamp(next.z, -COURT_DEPTH / 2, COURT_DEPTH / 2);
      next.y = ANNOTATION_Y;
      points[points.length - 1].copy(next);
      this.updateSelectedAnnotationHandles(this.movingAnnotation);
      this.rebuildAnnotationVisual(this.movingAnnotation, mode, points);
    } else if (this.dragMode === 'annotation') {
      const nextPosition = point.clone().add(this.moveOffset);
      this.movingAnnotation.position.x = THREE.MathUtils.clamp(nextPosition.x, -COURT_WIDTH / 2, COURT_WIDTH / 2);
      this.movingAnnotation.position.z = THREE.MathUtils.clamp(nextPosition.z, -COURT_DEPTH / 2, COURT_DEPTH / 2);
    }
  }

  private addAnglePoint(annotation: THREE.Group, point: THREE.Vector3): void {
    const points = annotation.userData.points as THREE.Vector3[] | undefined;
    const mode = annotation.userData.annotationMode as AnnotationMode | undefined;
    if (!points || !mode) return;
    if (points.length === 2) points.splice(1, 0, point.clone());
    else points[1] = point.clone();
    this.rebuildAnnotationVisual(annotation, mode, points);
    this.updateSelectedAnnotationHandles(annotation);
  }

  private rebuildAnnotationVisual(annotation: THREE.Group, mode: AnnotationMode, points: THREE.Vector3[]): void {
    const style = ANNOTATION_STYLES[mode];
    annotation.userData.points = points.map((p) => p.clone());

    const visualChildren = annotation.children.filter((child) =>
      !((child as THREE.Mesh).userData as { handleType?: string }).handleType,
    );

    for (const child of visualChildren) {
      annotation.remove(child);
      this.disposeObjectTree(child);
    }

    const lineGroup = this.createLineGroup(points, style, false);
    lineGroup.children.forEach((child) => {
      (child as THREE.Object3D & { userData: { annotationGroup?: THREE.Group } }).userData.annotationGroup = annotation;
    });
    annotation.add(lineGroup);

    const pathPoints = style.curved ? this.createPathPoints(points) : points;
    if (mode === 'screen') {
      const cap = this.createScreenCap(points[0], points[points.length - 1], style.color);
      cap.userData.annotationGroup = annotation;
      annotation.add(cap);
    }
    if (style.arrow) {
      const arrow = this.addArrow(points[points.length - 1], pathPoints[pathPoints.length - 2], style.color, false);
      arrow.userData.annotationGroup = annotation;
      annotation.add(arrow);
    }
  }

  private createHandleMesh(color: number, isPrimary: boolean): THREE.Group {
    const handleGroup = new THREE.Group();

    const outerGeometry = new THREE.RingGeometry(HANDLE_RADIUS - 0.02, HANDLE_RADIUS + 0.02, 24);
    const outerMaterial = new THREE.MeshBasicMaterial({
      color: isPrimary ? 0xffffff : 0x1a1a1a,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const outer = new THREE.Mesh(outerGeometry, outerMaterial);
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = ANNOTATION_Y + 0.01;
    outer.renderOrder = 8;
    handleGroup.add(outer);

    const innerGeometry = new THREE.CircleGeometry(HANDLE_RADIUS - 0.08, 24);
    const innerMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const inner = new THREE.Mesh(innerGeometry, innerMaterial);
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = ANNOTATION_Y + 0.012;
    inner.renderOrder = 9;
    handleGroup.add(inner);

    const hitGeometry = new THREE.CircleGeometry(HANDLE_RADIUS + 0.15, 20);
    const hitMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.001,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const hitArea = new THREE.Mesh(hitGeometry, hitMaterial);
    hitArea.rotation.x = -Math.PI / 2;
    hitArea.position.y = ANNOTATION_Y + 0.008;
    hitArea.renderOrder = 7;
    handleGroup.add(hitArea);

    return handleGroup;
  }

  private setSelectedAnnotation(annotation: THREE.Group): void {
    if (this.selectedAnnotation && this.selectedAnnotation !== annotation) {
      this.clearSelection();
    }
    this.selectedAnnotation = annotation;
    this.createHandlesForSelected(annotation);
  }

  private clearSelection(): void {
    if (!this.selectedAnnotation) return;
    this.removeHandles(this.selectedAnnotation);
    this.selectedAnnotation = undefined;
  }

  private createHandlesForSelected(annotation: THREE.Group): void {
    const points = annotation.userData.points as THREE.Vector3[];
    const mode = annotation.userData.annotationMode as AnnotationMode;
    const style = ANNOTATION_STYLES[mode];

    if (!annotation.userData.startHandle) {
      const startHandle = this.createHandleMesh(style.color, true);
      startHandle.userData.handleType = 'start';
      startHandle.userData.annotationGroup = annotation;
      startHandle.position.copy(points[0]);
      annotation.add(startHandle);
      annotation.userData.startHandle = startHandle;
    }

    if (!annotation.userData.endHandle) {
      const endHandle = this.createHandleMesh(style.color, false);
      endHandle.userData.handleType = 'end';
      endHandle.userData.annotationGroup = annotation;
      endHandle.position.copy(points[points.length - 1]);
      annotation.add(endHandle);
      annotation.userData.endHandle = endHandle;
    }

    this.updateSelectedAnnotationHandles(annotation);
  }

  private rebuildHandlesForSelected(annotation: THREE.Group): void {
    this.removeHandles(annotation);
    this.createHandlesForSelected(annotation);
  }

  private removeHandles(annotation: THREE.Group): void {
    const start = annotation.userData.startHandle as THREE.Group | undefined;
    const end = annotation.userData.endHandle as THREE.Group | undefined;
    if (start) {
      annotation.remove(start);
      this.disposeObjectTree(start);
      annotation.userData.startHandle = undefined;
    }
    if (end) {
      annotation.remove(end);
      this.disposeObjectTree(end);
      annotation.userData.endHandle = undefined;
    }
  }

  private updateSelectedAnnotationHandles(annotation: THREE.Group): void {
    const points = annotation.userData.points as THREE.Vector3[];
    const start = annotation.userData.startHandle as THREE.Group | undefined;
    const end = annotation.userData.endHandle as THREE.Group | undefined;
    if (start) start.position.copy(points[0]).setY(0);
    if (end) end.position.copy(points[points.length - 1]).setY(0);
  }

  private createPathPoints(endpoints: THREE.Vector3[]): THREE.Vector3[] {
    const path: THREE.Vector3[] = [];
    for (let index = 0; index < endpoints.length - 1; index += 1) {
      const segment = this.createCurvePoints(endpoints[index], endpoints[index + 1]);
      path.push(...(index === 0 ? segment : segment.slice(1)));
    }
    return path;
  }

  private createCurvePoints(start: THREE.Vector3, end: THREE.Vector3): THREE.Vector3[] {
    const direction = end.clone().sub(start);
    const length = direction.length();
    if (length < 0.001) return [start.clone().setY(ANNOTATION_Y), end.clone().setY(ANNOTATION_Y)];

    const forward = direction.normalize();
    const perpendicular = new THREE.Vector3(-forward.z, 0, forward.x);
    const waveCount = Math.max(3, Math.round(length * 1.8));
    const amplitude = Math.min(0.38, length * 0.08);
    const points: THREE.Vector3[] = [];
    for (let index = 0; index <= 32; index += 1) {
      const progress = index / 32;
      const point = start.clone().lerp(end, progress);
      const envelope = Math.sin(Math.PI * progress);
      point.addScaledVector(perpendicular, Math.sin(progress * waveCount * Math.PI * 2) * amplitude * envelope);
      points.push(point.setY(ANNOTATION_Y));
    }
    return points;
  }
}
