import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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
    this.addPerimeter();
    this.addAtmosphere();
    window.addEventListener('resize', this.handleResize);
  }

  public start(): void {
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  public dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.renderer.setAnimationLoop(null);
    this.controls.dispose();
    this.renderer.dispose();
  }

  private readonly handleResize = (): void => {
    const width = this.root.clientWidth;
    const height = this.root.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

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
    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(COURT_WIDTH, COURT_DEPTH),
      new THREE.MeshStandardMaterial({
        color: '#c4864d',
        roughness: 0.72,
        metalness: 0,
      }),
    );
    field.rotation.x = -Math.PI / 2;
    field.position.y = FIELD_Y;
    field.receiveShadow = true;
    this.scene.add(field);

    const markings = new THREE.Group();
    const lineMaterial = new THREE.LineBasicMaterial({ color: '#e6f0d8', transparent: true, opacity: 0.92 });
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

  private addPerimeter(): void {
    const postsMaterial = new THREE.MeshStandardMaterial({ color: '#273b3c', roughness: 0.62, metalness: 0.5 });
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
