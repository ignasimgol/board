import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PlayerTokens } from './PlayerTokens';
import { Menu } from './Menu';
import { AnnotationTools } from './AnnotationTools';
import { TimelineController } from './TimelineController';
import parquetTextureUrl from '../assets/parquet.jpg';

const COURT_WIDTH = 28;
const COURT_DEPTH = 15;
const FIELD_Y = 0;
const LINE_Y = 0.035;

export class BasketballScene {
  private readonly root: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly playerTokens: PlayerTokens;
  private readonly menu: Menu;
  private readonly annotations: AnnotationTools;
  private readonly timeline: TimelineController;
  private readonly ball: THREE.Mesh;
  private readonly cameraTarget = new THREE.Vector3(0, 0, 0);
  private followBall = false;
  private readonly timelinePanel: HTMLDivElement;
  private court?: THREE.Mesh;
  private introParallaxEnabled = true;
  private readonly parallaxTarget = new THREE.Vector3();
  private readonly parallaxOffset = new THREE.Vector3();

  constructor(root: HTMLElement) {
    this.root = root;
    this.scene.background = new THREE.Color('#081015');
    this.scene.fog = new THREE.Fog('#081015', 105, 230);

    this.camera.position.set(24, 22, 26);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(root.clientWidth, root.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    root.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 65;
    this.controls.minPolarAngle = 0.32;
    this.controls.maxPolarAngle = 1.43;
    this.controls.minAzimuthAngle = -1.25;
    this.controls.maxAzimuthAngle = 1.25;

    this.addLights();
    this.addGround();
    this.addCourt();
    if (!this.court) throw new Error('Court mesh was not created.');
    this.playerTokens = new PlayerTokens(root, this.camera, this.renderer.domElement, this.court, this.controls);
    this.scene.add(this.playerTokens.object);
    this.ball = this.createBall();
    this.playerTokens.syncBallToOwner(this.ball);
    this.scene.add(this.ball);
    this.timeline = new TimelineController(this.playerTokens, this.ball);
    this.menu = new Menu(root, this.playerTokens);
    this.annotations = new AnnotationTools(root, this.camera, this.renderer.domElement, this.court, this.controls, this.playerTokens);
    this.scene.add(this.annotations.object);
    this.addStands();
    this.addPerimeter();
    this.addAtmosphere();
    this.timelinePanel = this.createTimelinePanel();
    window.addEventListener('resize', this.handleResize);
  }

  public start(): void {
    this.renderer.setAnimationLoop((now) => {
      this.timeline.update(now);
      if (this.followBall) this.cameraTarget.lerp(this.ball.position, 0.12);
      else this.cameraTarget.lerp(this.controls.target, 0.12);
      this.controls.target.copy(this.cameraTarget);
      this.parallaxOffset.lerp(this.parallaxTarget, 0.06);
      this.scene.position.x = this.parallaxOffset.x;
      this.scene.position.z = this.parallaxOffset.z;
      this.controls.update();
      this.playerTokens.updateLabels();
      this.renderer.render(this.scene, this.camera);
    });
  }

  public setFollowBall(enabled: boolean): void {
    this.followBall = enabled;
  }

  public setIntroParallaxEnabled(enabled: boolean): void {
    this.introParallaxEnabled = enabled;
    if (!enabled) this.parallaxTarget.set(0, 0, 0);
  }

  public setIntroPointer(x: number, y: number): void {
    if (!this.introParallaxEnabled) return;
    this.parallaxTarget.set(x * 0.45, 0, y * 0.28);
  }

  public dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.renderer.setAnimationLoop(null);
    this.controls.dispose();
    this.playerTokens.dispose();
    this.menu.dispose();
    this.annotations.dispose();
    this.timelinePanel.remove();
    this.ball.geometry.dispose();
    (this.ball.material as THREE.Material).dispose();
    this.renderer.dispose();
  }

  private readonly handleResize = (): void => {
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private createBall(): THREE.Mesh {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 20, 12),
      new THREE.MeshStandardMaterial({ color: '#d96c32', roughness: 0.72 }),
    );
    ball.position.set(0.8, 0.32, -1.6);
    ball.castShadow = true;
    ball.name = 'basketball';
    return ball;
  }

  private createTimelinePanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'timeline-panel is-minimized';
    panel.innerHTML = `
      <div class="timeline-header"><strong>BROADCAST</strong><button type="button" class="panel-minimize" data-minimize aria-label="Minimizar broadcast">−</button></div>
      <div class="timeline-controls">
        <button type="button" data-play>PLAY</button>
        <label>SPD <select data-speed><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="2">2x</option></select></label>
        <label><input type="checkbox" data-loop checked /> LOOP</label>
        <label><input type="checkbox" data-follow /> FOLLOW BALL</label>
      </div>
      <div class="timeline-readout"><span data-time>00:00</span><strong data-action>SETUP</strong></div>
      <p class="live-commentary" data-commentary>Defensa colocada en media pista</p>`;
    this.root.appendChild(panel);
    const minimizeButton = panel.querySelector<HTMLButtonElement>('[data-minimize]')!;
    minimizeButton.textContent = '+';
    minimizeButton.setAttribute('aria-label', 'Restaurar broadcast');
    minimizeButton.addEventListener('click', () => {
      const minimized = panel.classList.toggle('is-minimized');
      minimizeButton.textContent = minimized ? '+' : '−';
      minimizeButton.setAttribute('aria-label', minimized ? 'Restaurar broadcast' : 'Minimizar broadcast');
    });
    const play = panel.querySelector<HTMLButtonElement>('[data-play]')!;
    play.addEventListener('click', () => {
      this.timeline.togglePlay();
      play.textContent = this.timeline.isPlaying ? 'PAUSE' : 'PLAY';
    });
    panel.querySelector<HTMLSelectElement>('[data-speed]')!.addEventListener('change', (event) => this.timeline.setSpeed(Number((event.target as HTMLSelectElement).value)));
    panel.querySelector<HTMLInputElement>('[data-loop]')!.addEventListener('change', (event) => this.timeline.setLoop((event.target as HTMLInputElement).checked));
    panel.querySelector<HTMLInputElement>('[data-follow]')!.addEventListener('change', (event) => this.setFollowBall((event.target as HTMLInputElement).checked));
    this.timeline.subscribe((snapshot) => {
      panel.querySelector('[data-time]')!.textContent = `${Math.floor(snapshot.timestamp / 60000).toString().padStart(2, '0')}:${Math.floor(snapshot.timestamp / 1000 % 60).toString().padStart(2, '0')}`;
      panel.querySelector('[data-action]')!.textContent = snapshot.action;
      panel.querySelector('[data-commentary]')!.textContent = snapshot.commentary;
    });
    return panel;
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight('#dce8d2', '#15232b', 1.35));

    const stadiumLight = new THREE.DirectionalLight('#fff8e8', 3.2);
    stadiumLight.position.set(-42, 82, 35);
    stadiumLight.castShadow = true;
    stadiumLight.shadow.mapSize.set(2048, 2048);
    stadiumLight.shadow.camera.left = -90;
    stadiumLight.shadow.camera.right = 90;
    stadiumLight.shadow.camera.top = 90;
    stadiumLight.shadow.camera.bottom = -90;
    stadiumLight.shadow.camera.near = 1;
    stadiumLight.shadow.camera.far = 220;
    stadiumLight.shadow.bias = -0.0005;
    this.scene.add(stadiumLight);

    const rimLight = new THREE.DirectionalLight('#3d8294', 1.4);
    rimLight.position.set(70, 35, -80);
    this.scene.add(rimLight);
  }

  private addGround(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(280, 220),
      new THREE.MeshStandardMaterial({ color: '#0b171b', roughness: 0.96, metalness: 0.05 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.12;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  private addCourt(): void {
    const parquetTexture = new THREE.TextureLoader().load(parquetTextureUrl);
    parquetTexture.colorSpace = THREE.SRGBColorSpace;
    parquetTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    parquetTexture.wrapS = THREE.ClampToEdgeWrapping;
    parquetTexture.wrapT = THREE.ClampToEdgeWrapping;
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(COURT_WIDTH, COURT_DEPTH),
      new THREE.MeshStandardMaterial({
        map: parquetTexture,
        color: '#c4864d',
        roughness: 0.72,
        metalness: 0,
      }),
    );
    field.rotation.x = -Math.PI / 2;
    field.position.y = FIELD_Y;
    field.receiveShadow = true;
    this.scene.add(field);
    this.court = field;

    const markings = new THREE.Group();
    const lineMaterial = new THREE.LineBasicMaterial({ color: '#e6f0d8', transparent: true, opacity: 0.92, linewidth: 2.5 });
    const addRectangle = (width: number, depth: number, x: number, z: number): void => {
      const points = [
        new THREE.Vector3(x - width / 2, LINE_Y, z - depth / 2),
        new THREE.Vector3(x + width / 2, LINE_Y, z - depth / 2),
        new THREE.Vector3(x + width / 2, LINE_Y, z + depth / 2),
        new THREE.Vector3(x - width / 2, LINE_Y, z + depth / 2),
      ];
      markings.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), lineMaterial));
    };

    addRectangle(COURT_WIDTH - 0.12, COURT_DEPTH - 0.12, 0, 0);
    const halfway = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, LINE_Y, -COURT_DEPTH / 2),
        new THREE.Vector3(0, LINE_Y, COURT_DEPTH / 2),
      ]),
      lineMaterial,
    );
    markings.add(halfway);
    markings.add(new THREE.LineLoop(this.circleGeometry(1.8, 0, 0), lineMaterial));

    for (const end of [-1, 1]) {
      const x = end * (COURT_WIDTH / 2 - 5.8 / 2);
      addRectangle(5.8, 4.9, x, 0);
      markings.add(new THREE.LineLoop(this.circleGeometry(1.8, end * (COURT_WIDTH / 2 - 5.8), 0), lineMaterial));
      markings.add(new THREE.Line(this.arcGeometry(6.75, end), lineMaterial));
        markings.add(new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(end * (COURT_WIDTH / 2 - 1.25), LINE_Y, -6.6),
          new THREE.Vector3(end * (COURT_WIDTH / 2), LINE_Y, -6.6),
          new THREE.Vector3(end * (COURT_WIDTH / 2 - 1.25), LINE_Y, 6.6),
          new THREE.Vector3(end * (COURT_WIDTH / 2), LINE_Y, 6.6),
        ]),
        lineMaterial,
      ));
      this.addBasket(end);
    }

    markings.traverse((object) => {
      object.renderOrder = 1;
      object.frustumCulled = false;
    });
    this.scene.add(markings);
  }

  private circleGeometry(radius: number, x: number, z: number): THREE.BufferGeometry {
    const points: THREE.Vector3[] = [];
    for (let index = 0; index <= 48; index += 1) {
      const angle = (index / 48) * Math.PI * 2;
      points.push(new THREE.Vector3(x + Math.cos(angle) * radius, LINE_Y, z + Math.sin(angle) * radius));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }

  private arcGeometry(radius: number, end: number): THREE.BufferGeometry {
    const points: THREE.Vector3[] = [];
    const centerX = end * (COURT_WIDTH / 2 - 1.25);
    const start = end === 1 ? Math.PI / 2 : -Math.PI / 2;
    for (let index = 0; index <= 32; index += 1) {
      const angle = start + (index / 32) * Math.PI;
      points.push(new THREE.Vector3(centerX + Math.cos(angle) * radius, LINE_Y, Math.sin(angle) * radius));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }

  private addBasket(end: number): void {
    // Grupo principal de la canasta para gestionar posicionamiento y rotación según el extremo de la cancha
    const basketGroup = new THREE.Group();

    // Materiales integrados con la estética de la escena
    const poleMaterial = new THREE.MeshStandardMaterial({
      color: '#1c2830',
      roughness: 0.4,
      metalness: 0.7,
    });

    const padMaterial = new THREE.MeshStandardMaterial({
      color: '#c0392b',
      roughness: 0.5,
      metalness: 0.1,
    });

    const backboardFrameMaterial = new THREE.MeshStandardMaterial({
      color: '#0f171c',
      roughness: 0.3,
      metalness: 0.8,
    });

    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: '#877474',
 
    });

    const whiteLineMaterial = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      side: THREE.DoubleSide,
    });

    const rimMaterial = new THREE.MeshStandardMaterial({
      color: '#e67e22',
      roughness: 0.3,
      metalness: 0.4,
    });

    const netMaterial = new THREE.MeshStandardMaterial({
      color: '#e6e6e6',
      roughness: 0.9,
      wireframe: true,
      side: THREE.DoubleSide,
    });

    // --- 1. POSTE Y PROTECTOR ---
    // Base del poste
    const poleBase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.2, 16), poleMaterial);
    poleBase.position.set(0, 1.6, -0.6);
    poleBase.castShadow = true;
    poleBase.receiveShadow = true;
    basketGroup.add(poleBase);

    // Protector acolchado inferior
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 1.4, 16), padMaterial);
    pad.position.set(0, 0.7, -0.6);
    pad.castShadow = true;
    basketGroup.add(pad);

    // Brazo extensor diagonal hacia la cancha
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5, 12), poleMaterial);
    arm.rotation.x = Math.PI / 4;
    arm.position.set(0, 2.9, -0.31);
    arm.castShadow = true;
    basketGroup.add(arm);

    // --- 2. TABLERO Y MARCO ---
    const backboardGroup = new THREE.Group();
    backboardGroup.position.set(0, 3.35, 0.25);

    // Cristal del tablero (orientado hacia Z+)
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.04), glassMaterial);
    glass.castShadow = true;
    backboardGroup.add(glass);

    // Marco posterior del tablero
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.84, 1.09, 0.02), backboardFrameMaterial);
    frame.position.z = -0.02;
    frame.castShadow = true;
    backboardGroup.add(frame);

    // Cuadro interior blanco de tiro
    const innerSquare = new THREE.Mesh(new THREE.BoxGeometry(0.59, 0.45, 0.045), whiteLineMaterial);
    innerSquare.position.set(0, -0.15, 0);
    backboardGroup.add(innerSquare);

    const innerCutout = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.35, 0.05), glassMaterial);
    innerCutout.position.set(0, -0.15, 0);
    backboardGroup.add(innerCutout);

    basketGroup.add(backboardGroup);

    // --- 3. ARO Y RED ---
    const rimGroup = new THREE.Group();
    rimGroup.position.set(0, 3.05, 0.27);

    // Aro
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 16, 32), rimMaterial);
    rim.rotation.x = Math.PI / 2;
    rim.position.z = 0.25;
    rim.castShadow = true;
    rimGroup.add(rim);

    // Soporte conector aro-tablero
    const mount = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.08), rimMaterial);
    mount.position.set(0, 0, 0.02);
    rimGroup.add(mount);

    // Red cónica en wireframe
    const net = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.45, 12, 6, true), netMaterial);
    net.position.set(0, -0.225, 0.25);
    rimGroup.add(net);

    basketGroup.add(rimGroup);

    // --- 4. UBICACIÓN Y ORIENTACIÓN SEGÚN EL EXTREMO (end: -1 o 1) ---
    const posX = end * (COURT_WIDTH / 2 - 0.65);
    basketGroup.position.set(posX, 0, 0);

    // Orienta la canasta mirando hacia el centro de la pista según el lado en el que esté
    if (end === 1) {
      basketGroup.rotation.y = -Math.PI / 2;
    } else {
      basketGroup.rotation.y = Math.PI / 2;
    }

    this.scene.add(basketGroup);
  }

  private addStands(): void {
    const courtHalfW = COURT_WIDTH / 2;
    const courtHalfD = COURT_DEPTH / 2;

    const lightSeatMat = new THREE.MeshStandardMaterial({ color: '#c4c8cb', roughness: 0.93, metalness: 0.0 });
    const midSeatMat = new THREE.MeshStandardMaterial({ color: '#9da2a6', roughness: 0.95, metalness: 0.0 });
    const darkSeatMat = new THREE.MeshStandardMaterial({ color: '#3a4148', roughness: 0.96, metalness: 0.0 });
    const greenSeatMat = new THREE.MeshStandardMaterial({ color: '#1d6b48', roughness: 0.94, metalness: 0.02 });
    const treadMat = new THREE.MeshStandardMaterial({ color: '#7e7669', roughness: 0.97, metalness: 0.0 });
    const riserMat = new THREE.MeshStandardMaterial({ color: '#524b43', roughness: 0.96, metalness: 0.0 });
    const fasciaMat = new THREE.MeshStandardMaterial({ color: '#c48a50', roughness: 0.72, metalness: 0.04 });
    const railingMat = new THREE.MeshStandardMaterial({ color: '#2a2620', roughness: 0.78, metalness: 0.38 });
    const scoreboardMat = new THREE.MeshStandardMaterial({ color: '#6a7278', roughness: 0.6, metalness: 0.3 });
    const screenMat = new THREE.MeshStandardMaterial({ color: '#0e1216', roughness: 0.2, metalness: 0.1, emissive: '#06101a', emissiveIntensity: 0.15 });

    const riserHeight = 0.44;
    const treadDepth = 0.72;
    const courtGap = 1.5;
    const seatWidth = 0.5;
    const seatDepth = 0.42;
    const seatBackH = 0.34;
    const aisleW = 1.0;

    const buildSeatRow = (
      rowLength: number,
      row: number,
      aisleXPositions: number[],
      yOffset: number,
      facingNormal: THREE.Vector3,
      greenZones: [number, number][] = [],
      darkZones: [number, number][] = [],
    ): THREE.Group => {
      const rowGroup = new THREE.Group();
      const treadW = rowLength + row * 0.2 + 0.4;
      const tread = new THREE.Mesh(new THREE.BoxGeometry(treadW, 0.06, treadDepth + 0.1), treadMat);
      tread.position.y = yOffset;
      tread.receiveShadow = true;
      rowGroup.add(tread);

      const riser = new THREE.Mesh(new THREE.BoxGeometry(treadW, riserHeight - 0.06, 0.06), riserMat);
      riser.position.y = yOffset + (riserHeight - 0.06) / 2 - 0.03;
      riser.position.z = facingNormal.z > 0 ? -treadDepth / 2 : treadDepth / 2;
      riser.receiveShadow = true;
      rowGroup.add(riser);

      const seatLaneW = rowLength - aisleXPositions.length * aisleW;
      const seatCount = Math.floor(seatLaneW / seatWidth);
      const totalSeatW = seatCount * seatWidth;
      const padding = (seatLaneW - totalSeatW) / 2;

      const sortedAisles = [...aisleXPositions].sort((a, b) => a - b);
      const seatPositions: number[] = [];
      let cursor = -rowLength / 2 + padding;
      for (let i = 0; i <= sortedAisles.length; i++) {
        const aisleEnd = i < sortedAisles.length ? sortedAisles[i] - aisleW / 2 : rowLength / 2 - padding;
        while (cursor + seatWidth / 2 <= aisleEnd - seatWidth / 2 && seatPositions.length < seatCount) {
          seatPositions.push(cursor + seatWidth / 2);
          cursor += seatWidth;
        }
        if (i < sortedAisles.length) cursor = sortedAisles[i] + aisleW / 2;
      }

      for (const sx of seatPositions) {
        let mat = lightSeatMat;
        if (row < 3) mat = darkSeatMat;
        else if (greenZones.some(([a, b]) => sx >= a && sx <= b)) mat = greenSeatMat;
        else if (darkZones.some(([a, b]) => sx >= a && sx <= b)) mat = midSeatMat;
        else if (row % 7 === 3) mat = midSeatMat;

        const seatBase = new THREE.Mesh(new THREE.BoxGeometry(seatWidth * 0.92, 0.06, seatDepth), mat);
        seatBase.position.set(sx, yOffset + 0.03, facingNormal.z !== 0 ? 0 : 0);
        rowGroup.add(seatBase);

        const backPos = new THREE.Vector3(
          seatBase.position.x,
          yOffset + 0.03 + seatBackH / 2,
          seatBase.position.z - facingNormal.z * seatDepth / 2 - facingNormal.x * seatDepth / 2,
        );
        const seatBack = new THREE.Mesh(new THREE.BoxGeometry(seatWidth * 0.92, seatBackH, 0.05), mat);
        seatBack.position.copy(backPos);
        rowGroup.add(seatBack);
      }

      for (const ax of aisleXPositions) {
        const aisleTread = new THREE.Mesh(
          new THREE.BoxGeometry(aisleW, 0.02, treadDepth),
          riserMat
        );
        aisleTread.position.set(ax, yOffset + 0.04, 0);
        rowGroup.add(aisleTread);
      }

      return rowGroup;
    };

    const buildSideStand = (
      side: 'left' | 'right' | 'top' | 'bottom',
    ): THREE.Group => {
      const stand = new THREE.Group();
      const isLong = side === 'left' || side === 'right';
      const numRows = isLong ? 14 : 11;
      const baseLen = isLong ? COURT_DEPTH + 3.0 : COURT_WIDTH + 2.0;

      const facing = new THREE.Vector3();
      const rotY = side === 'left' ? Math.PI / 2 : side === 'right' ? -Math.PI / 2 : side === 'top' ? Math.PI : 0;
      const signX = side === 'left' ? -1 : side === 'right' ? 1 : 0;
      const signZ = side === 'bottom' ? -1 : side === 'top' ? 1 : 0;
      facing.set(signX, 0, signZ).normalize();

      const aislePositions: number[] = [];
      if (isLong) {
        const seg = baseLen / 4;
        aislePositions.push(-seg, 0, seg);
      } else {
        const seg = baseLen / 4;
        aislePositions.push(-seg * 1.1, 0, seg * 1.1);
      }

      const greenZones: [number, number][] = [];
      const darkZones: [number, number][] = [];
      if (isLong) {
        const q = baseLen / 4;
        greenZones.push([q * 0.6, q * 1.4], [-q * 1.4, -q * 0.6]);
      }

      for (let row = 0; row < numRows; row++) {
        const y = row * riserHeight + riserHeight * 0.1;
        const backOffset = courtGap + row * treadDepth;
        const x = signX * (courtHalfW + backOffset + treadDepth / 2);
        const z = signZ * (courtHalfD + backOffset + treadDepth / 2);
        const rowLen = baseLen + row * 0.25;
        const rowGroup = buildSeatRow(rowLen, row, aislePositions.map((a) => a * (rowLen / baseLen)), y, facing, greenZones, darkZones);
        rowGroup.position.set(x, 0, z);
        rowGroup.rotation.y = rotY;
        stand.add(rowGroup);
      }

      const lastY = (numRows - 1) * riserHeight;
      const fasciaLen = baseLen + (numRows - 1) * 0.25;
      const fasciaX = signX * (courtHalfW + courtGap - 0.05);
      const fasciaZ = signZ * (courtHalfD + courtGap - 0.05);
      const fascia = new THREE.Mesh(
        new THREE.BoxGeometry(
          signX !== 0 ? 0.08 : fasciaLen,
          lastY * 0.75,
          signZ !== 0 ? 0.08 : fasciaLen,
        ),
        fasciaMat
      );
      fascia.position.set(
        fasciaX,
        lastY * 0.75 / 2 + 0.05,
        fasciaZ,
      );
      fascia.receiveShadow = true;
      stand.add(fascia);

      const railY = lastY + riserHeight;
      const railBack = courtGap + (numRows - 0.5) * treadDepth;
      const rx = signX * (courtHalfW + railBack);
      const rz = signZ * (courtHalfD + railBack);
      const topRail = new THREE.Mesh(
        new THREE.BoxGeometry(signX !== 0 ? 0.05 : fasciaLen + 0.3, 0.08, signZ !== 0 ? 0.05 : treadDepth),
        railingMat
      );
      topRail.position.set(rx, railY + 0.9, rz);
      stand.add(topRail);
      const railPostCount = 5;
      for (let i = 0; i < railPostCount; i++) {
        const t = (i + 0.5) / railPostCount - 0.5;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.05), railingMat);
        if (signX !== 0) {
          post.position.set(rx, railY + 0.45, rz + t * (fasciaLen + 0.2));
        } else {
          post.position.set(rx + t * (fasciaLen + 0.2), railY + 0.45, rz);
        }
        stand.add(post);
      }

      return stand;
    };

    this.scene.add(buildSideStand('left'));
    this.scene.add(buildSideStand('right'));
    this.scene.add(buildSideStand('top'));
    this.scene.add(buildSideStand('bottom'));

    const cornerHeight = 12 * riserHeight;
    const cornerMat = riserMat;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const cx = sx * (courtHalfW + courtGap + 4.8 * treadDepth);
      const cz = sz * (courtHalfD + courtGap + 3.8 * treadDepth);
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(5.2, cornerHeight, 5.2),
        cornerMat
      );
      block.position.set(cx, cornerHeight / 2, cz);
      block.receiveShadow = true;
      this.scene.add(block);
    }

    const catwalkMat = riserMat;
    const rearExtent = courtHalfW + courtGap + (14 + 2) * treadDepth;
    const sideExtent = courtHalfD + courtGap + (11 + 2) * treadDepth;
    for (const [sx] of [[-1], [1]] as const) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.5, sideExtent * 2.12),
        catwalkMat
      );
      beam.position.set(sx * rearExtent, 14 * riserHeight + 1.3, 0);
      this.scene.add(beam);
    }
    for (const [sz] of [[-1], [1]] as const) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(rearExtent * 2.1, 0.5, 0.6),
        catwalkMat
      );
      beam.position.set(0, 11 * riserHeight + 1.3, sz * sideExtent);
      this.scene.add(beam);
    }

    const sbGroup = new THREE.Group();
    const sbHeight = 3.2;
    const sbWidth = 4.8;
    const sbDepth = 3.2;
    const sbY = 11.5;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(sbWidth, sbHeight, sbDepth), scoreboardMat);
    frame.position.y = sbY;
    sbGroup.add(frame);

    for (const [sx, sz, rY] of [
      [1, 0, Math.PI / 2],
      [-1, 0, -Math.PI / 2],
      [0, 1, 0],
      [0, -1, Math.PI],
    ] as const) {
      const isSide = sx !== 0;
      const sw = isSide ? sbDepth : sbWidth - 0.2;
      const sh = sbHeight - 0.3;
      const screen = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 0.05), screenMat);
      screen.position.set(sx * (sbWidth / 2 + 0.02), sbY, sz * (sbDepth / 2 + 0.02));
      screen.rotation.y = rY;
      sbGroup.add(screen);
    }
    this.scene.add(sbGroup);

    const suspMat = railingMat;
    for (const [sx, sz] of [[-2.2, -1.4], [2.2, -1.4], [-2.2, 1.4], [2.2, 1.4]] as const) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 6, 6), suspMat);
      cable.position.set(sx, sbY + 3, sz);
      this.scene.add(cable);
    }
  }

  private addPerimeter(): void {
    const boardMaterial = new THREE.MeshStandardMaterial({ color: '#102b31', emissive: '#09272b', emissiveIntensity: 0.7 });
    for (const [x, z, width, rotation] of [
      [0, -10, 28, 0],
      [0, 10, 28, 0],
      [-18, 0, 15, Math.PI / 2],
      [18, 0, 15, Math.PI / 2],
    ] as const) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(width, 2.4, 0.35), boardMaterial);
      board.position.set(x, 1.2, z);
      board.rotation.y = rotation;
      board.receiveShadow = true;
      this.scene.add(board);
    
    }
  }

  private addAtmosphere(): void {
    const stars = new THREE.BufferGeometry();
    const positions: number[] = [];
    for (let index = 0; index < 180; index += 1) {
      positions.push((Math.random() - 0.5) * 260, 24 + Math.random() * 60, (Math.random() - 0.5) * 190);
    }
    stars.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: '#9bb9aa', size: 0.35, transparent: true, opacity: 0.5 })));
  }
}
