import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

let scene;
let camera;
let introScene;
let introCamera;
let introStage;
let renderer;
let clock;
let player;
let terrain;
let environment;
let environmentBounds = new THREE.Box3();
let portal;
let portalActive = false;
let guardianNPC = null;
let currentInteractable = null;
let debugControls = null;
let audioContext = null;
let ambientMusic = null;
const soundEffects = {};
let pendingDecision = null;

const keys = new Set();
const mouse = {
  x: 0,
  yaw: 0,
  targetYaw: 0,
  dragging: false,
};

const state = {
  energia: 0,
  timeRemaining: 60,
  timerAlertPlayed: false,
  caos: 0,
  estabilidad: 0,
  objetosAbsorbidos: [],
  afinidades: { luz: 0, cristal: 0, glitch: 0 },
  formaActual: "Latente",
  dashCooldown: 0,
  dashTime: 0,
  transformPulse: 0,
  transformElapsed: 0,
  isTransforming: false,
  pendingPortal: false,
  decisionOpen: false,
  guardianReady: false,
  guardianSpoken: false,
  guardianDialogOpen: false,
  shieldActive: false,
  gameStarted: false,
  ended: false,
};

const interactables = [];
const npcs = [];
const particles = [];
const timeOrbs = [];
const introCharacters = [];
const wallColliders = [];
const zoneAnchors = {};
const entrancePosition = new THREE.Vector3(0, 0.95, 3.5);
const PLAYER_MODEL_BOTTOM = -0.72;
const thirdPersonOffset = new THREE.Vector3(0, 6, 3);
const cameraRay = new THREE.Ray();
const tempVector = new THREE.Vector3();

const ui = {
  timer: document.querySelector("#timer-value"),
  status: document.querySelector("#state-value"),
  absorbed: document.querySelector("#absorbed-value"),
  interaction: document.querySelector("#interaction"),
  narrative: document.querySelector("#narrative"),
  decision: document.querySelector("#decision"),
  decisionTitle: document.querySelector("#decision-title"),
  decisionCopy: document.querySelector("#decision-copy"),
  absorbButton: document.querySelector("#absorb-button"),
  ignoreButton: document.querySelector("#ignore-button"),
  guardianDialog: document.querySelector("#guardian-dialog"),
  guardianReading: document.querySelector("#guardian-reading"),
  guardianCopy: document.querySelector("#guardian-copy"),
  guardianContinue: document.querySelector("#guardian-continue"),
  intro: document.querySelector("#intro"),
  ending: document.querySelector("#ending"),
  endingType: document.querySelector("#ending-type"),
  endingTitle: document.querySelector("#ending-title"),
  endingCopy: document.querySelector("#ending-copy"),
  startButton: document.querySelector("#start-button"),
  restartButton: document.querySelector("#restart-button"),
  volumeToggles: [...document.querySelectorAll("[data-volume-toggle]")],
};

init();

async function init() {
  THREE.Cache.enabled = true;
  clock = new THREE.Clock();
  setupAmbientMusic();
  setupSoundEffects();
  createScene();
  createWorld();
  await createEnvironment();
  await createPlayer();
  await createInteractables();
  await createNPCs();
  await createIntroShowcase();
  createPortal();
  createEventListeners();
  updateHUD();
  animate();
}

async function createIntroShowcase() {
  introScene = new THREE.Scene();
  introScene.background = new THREE.Color(0x04000c);
  introScene.fog = new THREE.FogExp2(0x10001f, 0.022);

  try {
    const backgroundTexture = await new THREE.TextureLoader().loadAsync("./assets/models/fondo%20portada.png");
    backgroundTexture.colorSpace = THREE.SRGBColorSpace;
    introScene.background = backgroundTexture;
    introScene.backgroundIntensity = 0.82;
  } catch (error) {
    console.error("FORMA_01: no se pudo cargar fondo portada.png; se usara el fondo oscuro.", error);
  }

  introCamera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 70);
  updateIntroCamera();

  introScene.add(new THREE.AmbientLight(0x6f4cff, 0.7));
  const magentaLight = new THREE.PointLight(0xff45dc, 22, 30);
  magentaLight.position.set(-4, 6, 5);
  introScene.add(magentaLight);
  const cyanLight = new THREE.PointLight(0x35d9ff, 18, 28);
  cyanLight.position.set(5, 4, 4);
  introScene.add(cyanLight);

  introStage = new THREE.Group();
  introStage.position.y = -1.34;
  introStage.scale.setScalar(1.26);
  introScene.add(introStage);
  createIntroEnvironment();

  const definitions = [
    { label: "Eco Curioso", file: "Eco_curioso.glb", x: -7.0, size: 2.3, color: 0xff66df },
    { label: "Eco Sabio", file: "Eco_sabio.glb", x: -4.25, size: 2.75, color: 0x4f9dff },
    { label: "Forma Inicial", file: "esfera.glb", x: -1.35, size: 2.05, color: 0xd98cff },
    { label: "Forma de Luz", file: "Forma_Luz.glb", x: 1.85, size: 2.9, color: 0xff6ee7 },
    { label: "Forma de Cristal", file: "Forma_Cristal.glb", x: 4.7, size: 2.9, color: 0x4be6ff },
    { label: "Forma de Glitch", file: "Forma_Glitch.glb", x: 7.45, size: 2.9, color: 0xb64cff },
  ];

  const models = await Promise.all(
    definitions.map((definition) => loadModel(
      `./assets/models/${definition.file}`,
      createBlobPlaceholder(),
      definition.file,
    )),
  );

  models.forEach((model, index) => {
    const definition = definitions[index];
    fitModelToBox(model, definition.size, 0);
    prepareIntroModel(model, definition.color);

    const character = new THREE.Group();
    character.position.set(definition.x, 0.08, 0);
    character.add(model);

    const pedestal = createIntroPedestal(definition.color);
    pedestal.position.y = 0.025;
    character.add(pedestal);

    const label = makeLabel(definition.label);
    label.position.set(0, definition.size + 0.88, 0);
    label.scale.set(2.25, 0.55, 1);
    character.add(label);

    const marker = createIntroMarker(definition.color, definition.size);
    character.add(marker);

    let speech = null;
    if (index === 0) {
      speech = makeSpeechBubble("¿Qué forma elegirás?", definition.color);
      speech.position.set(0.72, definition.size + 1.5, 0);
      character.add(speech);
    } else if (index === 1) {
      speech = makeSpeechBubble("Tus decisiones te darán forma.", definition.color);
      speech.position.set(0.85, definition.size + 1.55, 0);
      character.add(speech);
    }

    character.userData = {
      phase: index * 0.82,
      baseY: character.position.y,
      model,
      speech,
    };
    introStage.add(character);
    introCharacters.push(character);
  });
}

function prepareIntroModel(model, color) {
  const glowColor = new THREE.Color(color);
  model.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    cloneMaterial(child);
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!("emissive" in material)) continue;
      material.emissive.lerp(glowColor, 0.38);
      material.emissiveIntensity = Math.max(material.emissiveIntensity ?? 0, 0.82);
      if ("roughness" in material) material.roughness = Math.min(material.roughness ?? 0.5, 0.38);
    }
  });
}

function createIntroMarker(color, modelSize) {
  const marker = new THREE.Group();
  const line = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.38, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72 }),
  );
  line.position.y = modelSize + 0.42;
  marker.add(line);

  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 14, 10),
    new THREE.MeshBasicMaterial({ color }),
  );
  dot.position.y = modelSize + 0.64;
  marker.add(dot);
  return marker;
}

function makeSpeechBubble(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const accent = new THREE.Color(color).getStyle();

  context.beginPath();
  context.moveTo(38, 24);
  context.lineTo(730, 24);
  context.quadraticCurveTo(754, 24, 754, 48);
  context.lineTo(754, 184);
  context.quadraticCurveTo(754, 208, 730, 208);
  context.lineTo(188, 208);
  context.lineTo(130, 246);
  context.lineTo(142, 208);
  context.lineTo(38, 208);
  context.quadraticCurveTo(14, 208, 14, 184);
  context.lineTo(14, 48);
  context.quadraticCurveTo(14, 24, 38, 24);
  context.closePath();
  context.fillStyle = "rgba(8, 3, 18, 0.9)";
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = 4;
  context.shadowColor = accent;
  context.shadowBlur = 18;
  context.stroke();

  context.shadowBlur = 10;
  context.fillStyle = "rgba(255, 250, 255, 0.96)";
  context.font = "500 38px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 384, 116);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    }),
  );
  sprite.scale.set(3.25, 1.08, 1);
  sprite.renderOrder = 20;
  sprite.visible = false;
  return sprite;
}

function createIntroEnvironment() {
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(10.5, 96),
    new THREE.MeshStandardMaterial({
      color: 0x090315,
      emissive: 0x17072b,
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.42,
      roughness: 0.48,
      metalness: 0.32,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.38;
  introScene.add(floor);

  const starPositions = [];
  for (let i = 0; i < 460; i += 1) {
    starPositions.push(
      THREE.MathUtils.randFloatSpread(30),
      THREE.MathUtils.randFloat(0.5, 14),
      THREE.MathUtils.randFloat(-12, 4),
    );
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      color: 0xc768ff,
      size: 0.045,
      transparent: true,
      opacity: 0.72,
    }),
  );
  stars.name = "IntroStars";
  introScene.add(stars);

  const crystals = new THREE.Group();
  crystals.name = "IntroCrystals";
  for (let i = 0; i < 26; i += 1) {
    const color = i % 3 === 0 ? 0x45dfff : i % 2 === 0 ? 0xff4fd8 : 0x9d5cff;
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(THREE.MathUtils.randFloat(0.08, 0.24), 0),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: THREE.MathUtils.randFloat(0.35, 0.72),
        roughness: 0.24,
        metalness: 0.22,
      }),
    );
    crystal.position.set(
      THREE.MathUtils.randFloatSpread(19),
      THREE.MathUtils.randFloat(0.7, 6.2),
      THREE.MathUtils.randFloat(-5, 1.5),
    );
    crystal.scale.y = THREE.MathUtils.randFloat(1.3, 2.5);
    crystal.userData.phase = Math.random() * Math.PI * 2;
    crystals.add(crystal);
  }
  introScene.add(crystals);
}

function createIntroPedestal(color) {
  const pedestal = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.92, 0.92, 0.035, 64),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
    }),
  );
  pedestal.add(disc);

  [0.66, 0.84, 1.02].forEach((radius, index) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, index === 1 ? 0.022 : 0.012, 10, 80),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.82 - index * 0.2,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.03 + index * 0.008;
    pedestal.add(ring);
  });

  const underLight = new THREE.PointLight(color, 7.5, 4.2, 2);
  underLight.position.y = 0.34;
  pedestal.add(underLight);
  return pedestal;
}

function createScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020106);
  scene.fog = new THREE.FogExp2(0x120018, 0.035);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 55);
  camera.position.set(0, 6, 3);

  renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector("#game-canvas"),
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const ambient = new THREE.AmbientLight(0x7d4cff, 0.2);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xff73e8, 1.55);
  key.position.set(-8, 13, 6);
  scene.add(key);

  const blue = new THREE.PointLight(0x36c8ff, 4.5, 26);
  blue.position.set(7, 5, -8);
  scene.add(blue);

  const rose = new THREE.PointLight(0xff4fd8, 4.2, 28);
  rose.position.set(-8, 3.8, -5);
  scene.add(rose);

  const violet = new THREE.PointLight(0x9d5cff, 3.5, 24);
  violet.position.set(0, 7, 5);
  scene.add(violet);

  debugControls = new OrbitControls(camera, renderer.domElement);
  debugControls.enabled = false;
  debugControls.minDistance = 3;
  debugControls.maxDistance = 10;
  debugControls.minPolarAngle = Math.PI * 0.25;
  debugControls.maxPolarAngle = Math.PI * 0.48;
}

async function createPlayer() {
  const group = new THREE.Group();
  group.position.copy(entrancePosition);

  const fallbackBlob = createBlobPlaceholder();
  const blobModel = await loadModel("./assets/models/esfera.glb", fallbackBlob, "esfera.glb");
  fitModelToBox(blobModel, 1.7, PLAYER_MODEL_BOTTOM);
  blobModel.scale.multiplyScalar(1.05);
  const baseVisualScale = blobModel.scale.clone();
  group.add(blobModel);

  const deformMeshes = collectDeformableMeshes(blobModel);
  prepareTransformationMaterials(blobModel);

  if (deformMeshes.length === 0) {
    console.warn("FORMA_01: esfera.glb no contiene mallas deformables; se mantendra movimiento y flotacion sin deformacion de vertices.");
  }

  const mainMesh = deformMeshes[0] || fallbackBlob;

  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(1.08, 32, 18),
    new THREE.MeshBasicMaterial({
      color: 0xff4fd8,
      transparent: true,
      opacity: 0.09,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(aura);

  const shield = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.32, 1),
    new THREE.MeshBasicMaterial({
      color: 0x79e8ff,
      wireframe: true,
      transparent: true,
      opacity: 0,
    }),
  );
  group.add(shield);

  player = {
    group,
    blob: mainMesh,
    visual: blobModel,
    baseVisualScale,
    aura,
    shield,
    deformMeshes,
    baseY: group.position.y,
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
  };

  scene.add(group);
  camera.position.copy(player.group.position).add(thirdPersonOffset);
  camera.lookAt(player.group.position);
}

function createBlobPlaceholder() {
  const geometry = new THREE.SphereGeometry(0.82, 48, 32);
  geometry.userData.basePositions = Float32Array.from(geometry.attributes.position.array);
  const material = new THREE.MeshStandardMaterial({
    color: 0x7f47ff,
    emissive: 0x2c145e,
    emissiveIntensity: 0.6,
    roughness: 0.52,
    metalness: 0.05,
  });

  const blob = new THREE.Mesh(geometry, material);
  blob.scale.set(1.12, 0.82, 1.02);
  return blob;
}

function createWorld() {
  const terrainGeometry = new THREE.CylinderGeometry(13, 11, 0.72, 96);
  const terrainMaterial = new THREE.MeshStandardMaterial({
    color: 0x11101d,
    emissive: 0x08051d,
    roughness: 0.8,
    metalness: 0.12,
  });
  terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.position.y = -0.38;
  terrain.visible = false;
  scene.add(terrain);

  const rings = new THREE.Group();
  for (let i = 0; i < 5; i += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2 + i * 1.9, 0.01, 8, 160),
      new THREE.MeshBasicMaterial({
        color: i % 2 ? 0xff4fd8 : 0x36c8ff,
        transparent: true,
        opacity: 0.08,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01 + i * 0.002;
    rings.add(ring);
  }
  scene.add(rings);

  const starGeometry = new THREE.BufferGeometry();
  const positions = [];
  for (let i = 0; i < 520; i += 1) {
    positions.push(
      THREE.MathUtils.randFloatSpread(80),
      THREE.MathUtils.randFloat(4, 38),
      THREE.MathUtils.randFloatSpread(80),
    );
  }
  starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const stars = new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      color: 0xad7cff,
      size: 0.075,
      transparent: true,
      opacity: 0.78,
    }),
  );
  scene.add(stars);
  particles.push({ points: stars, drift: 0.015 });

  for (let i = 0; i < 36; i += 1) {
    const mote = new THREE.Mesh(
      new THREE.SphereGeometry(THREE.MathUtils.randFloat(0.025, 0.07), 12, 8),
      new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xff4fd8 : 0x36c8ff,
        transparent: true,
        opacity: 0.62,
      }),
    );
    mote.position.set(THREE.MathUtils.randFloatSpread(21), THREE.MathUtils.randFloat(0.7, 5), THREE.MathUtils.randFloatSpread(21));
    mote.userData.baseY = mote.position.y;
    scene.add(mote);
    particles.push({ mesh: mote, phase: Math.random() * Math.PI * 2 });
  }

  for (let i = 0; i < 70; i += 1) {
    const mist = new THREE.Mesh(
      new THREE.SphereGeometry(THREE.MathUtils.randFloat(0.045, 0.12), 12, 8),
      new THREE.MeshBasicMaterial({
        color: i % 2 ? 0x9d5cff : 0xff4fd8,
        transparent: true,
        opacity: THREE.MathUtils.randFloat(0.08, 0.18),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    mist.position.set(THREE.MathUtils.randFloatSpread(25), THREE.MathUtils.randFloat(0.5, 7), THREE.MathUtils.randFloatSpread(25));
    mist.userData.baseY = mist.position.y;
    mist.userData.speed = THREE.MathUtils.randFloat(0.05, 0.16);
    mist.userData.radius = THREE.MathUtils.randFloat(0.08, 0.28);
    scene.add(mist);
    particles.push({ mesh: mist, phase: Math.random() * Math.PI * 2, slow: true });
  }
}

async function createEnvironment() {
  environment = await loadModel(
    "./assets/models/ambiente_laberinto.glb",
    new THREE.Group(),
    "ambiente_laberinto.glb",
  );
  environment.name = "Ambiente_Laberinto";
  scene.add(environment);

  normalizeEnvironment();
  detectEnvironmentNodes();
  createWallColliders();
  resolveEnvironmentAnchors();
}

function normalizeEnvironment() {
  environment.updateMatrixWorld(true);
  let bounds = new THREE.Box3().setFromObject(environment);
  if (bounds.isEmpty()) {
    console.error("FORMA_01: el escenario no contiene geometria valida. Se usara el terreno de respaldo.");
    terrain.visible = true;
    environmentBounds.set(
      new THREE.Vector3(-11, 0, -11),
      new THREE.Vector3(11, 2, 11),
    );
    return;
  }
  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.z);

  // Conserva unidades Blender razonables; solo normaliza exportaciones extremas.
  if (maxDimension > 0 && (maxDimension < 24 || maxDimension > 90)) {
    environment.scale.multiplyScalar(52 / maxDimension);
  }

  environment.updateMatrixWorld(true);
  bounds = new THREE.Box3().setFromObject(environment);
  environment.position.y -= bounds.min.y;
  environment.updateMatrixWorld(true);
  environmentBounds.setFromObject(environment);
}

function detectEnvironmentNodes() {
  const required = ["Zona_Luz", "Zona_Cristal", "Zona_Glitch", "Portal_Final"];
  const found = new Set();
  const names = [];
  let torusPortal = null;

  environment.traverse((object) => {
    if (object.name) names.push(object.name);
    const normalizedName = object.name.toLowerCase();
    const compactName = normalizedName.replace(/[\s_-]+/g, "");
    if (object.isMesh && /^icosphere(?:[._]?\d+)?$/i.test(object.name)) {
      registerTimeOrb(object);
    }
    if (compactName === "baseinicio") {
      zoneAnchors.Base_Inicio = object;
    }
    if (normalizedName === "spawn_player") {
      zoneAnchors.Spawn_Player = object;
      object.visible = false;
    }
    if (!zoneAnchors.Entrada && (normalizedName.includes("entrada") || normalizedName.includes("puerta") || normalizedName.includes("door"))) {
      zoneAnchors.Entrada = object;
    }
    if (!torusPortal && normalizedName === "torus") torusPortal = object;
    for (const requiredName of required) {
      if (normalizedName === requiredName.toLowerCase()) {
        zoneAnchors[requiredName] = object;
        object.visible = false;
        found.add(requiredName);
      }
    }
  });

  if (!zoneAnchors.Portal_Final && torusPortal) {
    zoneAnchors.Portal_Final = torusPortal;
    found.add("Portal_Final");
    console.info("FORMA_01: Portal_Final no existe; se usara el objeto Torus visible en la salida.");
  }
  console.info(`FORMA_01: ${timeOrbs.length} esferas temporales detectadas.`);

  const missing = required.filter((name) => !found.has(name));
  if (missing.length > 0) {
    console.warn(`FORMA_01: faltan nodos de zona en ambiente_laberinto.glb: ${missing.join(", ")}. Se usaran posiciones libres calculadas.`);
    console.group("FORMA_01: nombres de objetos del escenario");
    for (const name of names) console.log(name);
    console.groupEnd();
  }
}

function registerTimeOrb(object) {
  const position = getObjectAnchorPosition(object, new THREE.Vector3());
  cloneMaterial(object);
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  for (const material of materials) {
    if (!material) continue;
    if ("color" in material) material.color.lerp(new THREE.Color(0xb84cff), 0.42);
    if ("emissive" in material) {
      material.emissive.set(0x8f36ff);
      material.emissiveIntensity = Math.max(material.emissiveIntensity ?? 0, 1.35);
    }
  }

  timeOrbs.push({ object, position, collected: false });
}

function createWallColliders() {
  wallColliders.length = 0;
  environment.updateMatrixWorld(true);

  environment.traverse((object) => {
    const name = object.name.toLowerCase();
    if (!object.isMesh || (!name.includes("muro") && !name.includes("pared"))) return;

    const box = new THREE.Box3().setFromObject(object);
    if (!box.isEmpty()) wallColliders.push(box);
  });

  console.info(`FORMA_01: ${wallColliders.length} colliders de muro generados.`);
}

function resolveEnvironmentAnchors() {
  const size = environmentBounds.getSize(new THREE.Vector3());
  const center = environmentBounds.getCenter(new THREE.Vector3());
  const floorY = environmentBounds.min.y + 0.95;

  const calculatedEntrance = new THREE.Vector3(center.x, floorY, environmentBounds.max.z - size.z * 0.08);
  const hasExplicitStart = Boolean(zoneAnchors.Base_Inicio || zoneAnchors.Spawn_Player || zoneAnchors.Entrada);
  if (zoneAnchors.Base_Inicio) {
    getObjectAnchorPosition(zoneAnchors.Base_Inicio, calculatedEntrance);
    const baseBox = new THREE.Box3().setFromObject(zoneAnchors.Base_Inicio);
    const baseSurfaceY = baseBox.isEmpty() ? environmentBounds.min.y : baseBox.max.y;
    calculatedEntrance.y = baseSurfaceY - PLAYER_MODEL_BOTTOM;
    console.info("FORMA_01: jugador colocado sobre Base Inicio.");
  } else if (zoneAnchors.Spawn_Player) {
    zoneAnchors.Spawn_Player.getWorldPosition(calculatedEntrance);
    calculatedEntrance.y = Math.max(calculatedEntrance.y, floorY);
    console.info("FORMA_01: jugador colocado en Spawn_Player.");
  } else if (zoneAnchors.Entrada) {
    zoneAnchors.Entrada.getWorldPosition(calculatedEntrance);
    calculatedEntrance.y = floorY;
    console.warn("FORMA_01: Spawn_Player no existe; se usara el nodo de entrada o puerta.");
  } else {
    console.warn("FORMA_01: Spawn_Player no existe; se usara la entrada calculada en el borde frontal del laberinto.");
  }

  const centerDistance = new THREE.Vector2(calculatedEntrance.x - center.x, calculatedEntrance.z - center.z).length();
  if (!hasExplicitStart && centerDistance < Math.min(size.x, size.z) * 0.15) {
    calculatedEntrance.set(center.x, floorY, environmentBounds.max.z - size.z * 0.08);
  }
  entrancePosition.copy(isPositionBlocked(calculatedEntrance) ? findFreePosition(calculatedEntrance) : calculatedEntrance);

  const fallbackTargets = {
    Zona_Luz: new THREE.Vector3(center.x - size.x * 0.28, floorY, center.z - size.z * 0.18),
    Zona_Cristal: new THREE.Vector3(center.x + size.x * 0.28, floorY, center.z - size.z * 0.18),
    Zona_Glitch: new THREE.Vector3(center.x, floorY, center.z + size.z * 0.08),
    Portal_Final: new THREE.Vector3(center.x, floorY, environmentBounds.min.z + size.z * 0.08),
  };

  for (const [name, fallback] of Object.entries(fallbackTargets)) {
    if (zoneAnchors[name]) {
      getObjectAnchorPosition(zoneAnchors[name], fallback);
      fallback.y = floorY;
    }
    zoneAnchors[name] = findFreePosition(fallback);
  }
}

function getObjectAnchorPosition(object, target) {
  const box = new THREE.Box3().setFromObject(object);
  if (!box.isEmpty()) return box.getCenter(target);
  return object.getWorldPosition(target);
}

function findFreePosition(preferred, radius = 0.72) {
  const candidate = preferred.clone();
  clampToEnvironment(candidate, radius);
  if (!isPositionBlocked(candidate, radius)) return candidate;

  const step = 1.15;
  for (let ring = 1; ring <= 24; ring += 1) {
    const samples = Math.max(12, ring * 8);
    for (let i = 0; i < samples; i += 1) {
      const angle = (i / samples) * Math.PI * 2;
      candidate.set(
        preferred.x + Math.cos(angle) * ring * step,
        preferred.y,
        preferred.z + Math.sin(angle) * ring * step,
      );
      clampToEnvironment(candidate, radius);
      if (!isPositionBlocked(candidate, radius)) return candidate.clone();
    }
  }

  console.warn("FORMA_01: no se encontro una posicion libre cercana; se usara el punto solicitado.", preferred);
  return preferred.clone();
}

function isPositionBlocked(position, radius = 0.58) {
  for (const box of wallColliders) {
    const nearestX = THREE.MathUtils.clamp(position.x, box.min.x, box.max.x);
    const nearestZ = THREE.MathUtils.clamp(position.z, box.min.z, box.max.z);
    const dx = position.x - nearestX;
    const dz = position.z - nearestZ;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

function clampToEnvironment(position, margin = 0.58) {
  if (environmentBounds.isEmpty()) return;
  position.x = THREE.MathUtils.clamp(position.x, environmentBounds.min.x + margin, environmentBounds.max.x - margin);
  position.z = THREE.MathUtils.clamp(position.z, environmentBounds.min.z + margin, environmentBounds.max.z - margin);
}

function movePlayerWithCollisions(delta) {
  const movement = tempVector.copy(player.velocity).multiplyScalar(delta);
  const candidate = player.group.position.clone();

  candidate.x += movement.x;
  clampToEnvironment(candidate);
  if (!isPositionBlocked(candidate)) {
    player.group.position.x = candidate.x;
  } else {
    player.velocity.x = 0;
  }

  candidate.copy(player.group.position);
  candidate.z += movement.z;
  clampToEnvironment(candidate);
  if (!isPositionBlocked(candidate)) {
    player.group.position.z = candidate.z;
  } else {
    player.velocity.z = 0;
  }
}

async function createInteractables() {
  const luzModel = await loadModel(
    "./assets/models/luz.glb",
    new THREE.Mesh(new THREE.SphereGeometry(0.66, 40, 24), emissiveMaterial(0xff68dd, 1.8)),
    "luz.glb",
    ["./assets/models/Luz.glb"],
  );
  fitModelToBox(luzModel, 1.35, -0.65);
  applyModelGlow(luzModel, 0xff68dd, 1.4);

  addInteractable({
    id: "luz",
    name: "Orbe de Luz",
    position: zoneAnchors.Zona_Luz.clone(),
    color: 0xff68dd,
    object: luzModel,
    label: "Orbe de Luz",
  });

  const glitchFallback = createGlitchPlaceholder();
  const glitch = await loadModel("./assets/models/glitch.glb", glitchFallback, "glitch.glb");
  fitModelToBox(glitch, 1.45, -0.7);
  applyModelGlow(glitch, 0x36c8ff, 1.3);
  addInteractable({
    id: "glitch",
    name: "Fragmento Glitch",
    position: zoneAnchors.Zona_Glitch.clone(),
    color: 0x36c8ff,
    object: glitch,
    label: "Fragmento Glitch",
  });

  const cristalModel = await loadModel(
    "./assets/models/cristal.glb",
    new THREE.Mesh(new THREE.OctahedronGeometry(0.82, 0), emissiveMaterial(0x8defff, 1.45)),
    "cristal.glb",
    ["./assets/models/Cristal.glb"],
  );
  fitModelToBox(cristalModel, 1.55, -0.74);
  cristalModel.rotation.y = Math.PI * 0.15;
  applyModelGlow(cristalModel, 0x8defff, 1.15);

  addInteractable({
    id: "cristal",
    name: "Nucleo Cristal",
    position: zoneAnchors.Zona_Cristal.clone(),
    color: 0x8defff,
    object: cristalModel,
    label: "Nucleo Cristal",
  });
}

function createGlitchPlaceholder() {
  const group = new THREE.Group();
  for (let i = 0; i < 7; i += 1) {
    const shard = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), emissiveMaterial(i % 2 ? 0x36c8ff : 0xff4fd8, 1.25));
    shard.position.set(THREE.MathUtils.randFloatSpread(0.9), THREE.MathUtils.randFloatSpread(0.7), THREE.MathUtils.randFloatSpread(0.9));
    shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    group.add(shard);
  }
  return group;
}

async function createNPCs() {
  const size = environmentBounds.getSize(new THREE.Vector3());
  const center = environmentBounds.getCenter(new THREE.Vector3());
  const floorY = environmentBounds.min.y + 0.95;
  const portalPosition = zoneAnchors.Portal_Final.clone();
  const towardCenter = center.clone().sub(portalPosition).setY(0).normalize();
  const guardianPosition = portalPosition.clone().addScaledVector(towardCenter, 2.2);
  guardianPosition.y = floorY;
  const definitions = [
    { name: "Guardian del Vacio", file: "Guardian_vacio.glb", position: guardianPosition, size: 2.8, color: 0x9d5cff },
    { name: "Eco Curioso", file: "Eco_curioso.glb", position: new THREE.Vector3(center.x - size.x * 0.34, floorY, center.z + size.z * 0.24), size: 1.9, color: 0xff68dd },
    { name: "Eco Sabio", file: "Eco_sabio.glb", position: new THREE.Vector3(center.x + size.x * 0.34, floorY, center.z + size.z * 0.1), size: 2.1, color: 0x36c8ff },
  ];

  for (const definition of definitions) {
    const fallback = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.75, 1),
      emissiveMaterial(definition.color, 0.7),
    );
    const model = await loadModel(`./assets/models/${definition.file}`, fallback, definition.file);
    fitModelToBox(model, definition.size, 0);

    const group = new THREE.Group();
    group.position.copy(findFreePosition(definition.position, 0.85));
    group.add(model);

    const label = makeLabel(definition.name);
    label.position.set(0, definition.size + 0.45, 0);
    label.visible = false;
    group.add(label);
    group.userData = {
      label,
      baseY: group.position.y,
      phase: Math.random() * Math.PI * 2,
    };

    scene.add(group);
    npcs.push(group);
    if (definition.file === "Guardian_vacio.glb") guardianNPC = group;
  }
}

function addInteractable({ id, name, position, color, object, label }) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.add(object);

  const light = new THREE.PointLight(color, 3.8, 8);
  light.position.y = 0.55;
  group.add(light);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.025, 12, 80),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.rotation.x = Math.PI / 2;
  group.add(halo);

  const text = makeLabel(label);
  text.position.set(0, 1.55, 0);
  text.visible = false;
  group.add(text);

  group.userData = { id, name, absorbed: false, color, label: text, object, halo };
  group.userData.baseY = group.position.y;
  scene.add(group);
  interactables.push(group);
}

function collectDeformableMeshes(object) {
  const meshes = [];
  object.traverse((child) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) return;

    child.geometry = child.geometry.clone();
    child.geometry.userData.basePositions = Float32Array.from(child.geometry.attributes.position.array);
    cloneMaterial(child);
    meshes.push(child);
  });
  return meshes;
}

function cloneMaterial(mesh) {
  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.map((material) => material.clone());
    return;
  }
  if (mesh.material) mesh.material = mesh.material.clone();
}

function fitModelToBox(object, targetSize, yOffset = 0) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);

  if (maxDimension > 0) {
    object.scale.multiplyScalar(targetSize / maxDimension);
  }

  object.updateMatrixWorld(true);
  const fittedBox = new THREE.Box3().setFromObject(object);
  const center = fittedBox.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= fittedBox.min.y;
  object.position.y += yOffset;
}

function applyModelGlow(object, color, intensity) {
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;

    cloneMaterial(child);
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if ("color" in material) material.color.set(color);
      if ("emissive" in material) {
        material.emissive.set(color);
        material.emissiveIntensity = intensity;
      }
      if ("roughness" in material) material.roughness = Math.min(material.roughness ?? 0.5, 0.36);
      if ("metalness" in material) material.metalness = Math.max(material.metalness ?? 0, 0.08);
    }
  });
}

function setPlayerMaterial(color, emissive, intensity) {
  player.visual.traverse((child) => {
    if (!child.isMesh || !child.material) return;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if ("color" in material) material.color.set(color);
      if ("emissive" in material) {
        material.emissive.set(emissive);
        material.emissiveIntensity = intensity;
      }
      if ("roughness" in material) material.roughness = Math.min(material.roughness ?? 0.52, 0.42);
      if ("metalness" in material) material.metalness = Math.max(material.metalness ?? 0.05, 0.08);
    }
  });
}

function emissiveMaterial(color, intensity) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.28,
    metalness: 0.18,
  });
}

function makeLabel(text) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = 512;
  canvas.height = 128;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = "500 36px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.fillStyle = "rgba(247,235,255,0.92)";
  context.shadowColor = "rgba(255,79,216,0.85)";
  context.shadowBlur = 18;
  context.fillText(text, 256, 75);

  const texture = new THREE.CanvasTexture(canvas);
  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  label.scale.set(2.5, 0.62, 1);
  return label;
}

function createPortal() {
  portal = new THREE.Group();
  portal.position.copy(zoneAnchors.Portal_Final);
  portal.position.y += 0.85;
  portal.visible = false;

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.35, 0.1, 18, 160),
    new THREE.MeshBasicMaterial({
      color: 0xff4fd8,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
    }),
  );
  portal.add(ring);

  const outerRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.72, 0.025, 12, 160),
    new THREE.MeshBasicMaterial({
      color: 0x36c8ff,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
    }),
  );
  outerRing.rotation.y = Math.PI / 2;
  portal.add(outerRing);

  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.92, 0.018, 12, 128),
    new THREE.MeshBasicMaterial({
      color: 0x9d5cff,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    }),
  );
  innerRing.rotation.x = Math.PI / 2;
  portal.add(innerRing);

  const core = new THREE.Mesh(
    new THREE.CircleGeometry(1.12, 64),
    new THREE.MeshBasicMaterial({
      color: 0x36c8ff,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  portal.add(core);

  const portalParticles = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({
      color: 0xff9df1,
      size: 0.055,
      transparent: true,
      opacity: 0.86,
      blending: THREE.AdditiveBlending,
    }),
  );
  const positions = [];
  for (let i = 0; i < 140; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = THREE.MathUtils.randFloat(0.55, 2.05);
    positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, THREE.MathUtils.randFloatSpread(0.22));
  }
  portalParticles.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  portal.add(portalParticles);

  const light = new THREE.PointLight(0xff4fd8, 8.5, 17);
  portal.add(light);
  scene.add(portal);
}

function createEventListeners() {
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", (event) => {
    if (state.guardianDialogOpen) return;
    if (state.decisionOpen) {
      if (event.code === "Escape") closeDecision();
      return;
    }
    keys.add(event.code);
    if (event.code === "KeyE") checkInteractions(true);
    if (event.code === "Space") activateTransformation();
    if (event.code === "KeyO") debugControls.enabled = !debugControls.enabled;
  });
  window.addEventListener("keyup", (event) => keys.delete(event.code));
  window.addEventListener("mousemove", (event) => {
    mouse.targetYaw -= event.movementX * 0.0022;
  });
  ui.startButton.addEventListener("click", () => {
    state.gameStarted = true;
    document.body.classList.remove("intro-active");
    ui.intro.classList.add("hidden");
    camera.position.copy(player.group.position).add(thirdPersonOffset);
    camera.lookAt(player.group.position);
    playAmbientMusic();
    playTone(220, 0.18, "sine");
  });
  ui.restartButton.addEventListener("click", () => window.location.reload());
  ui.absorbButton.addEventListener("click", async () => {
    const item = pendingDecision;
    closeDecision();
    if (item) await absorbObject(item);
  });
  ui.ignoreButton.addEventListener("click", closeDecision);
  ui.guardianContinue.addEventListener("click", closeGuardianDialog);
  for (const button of ui.volumeToggles) button.addEventListener("click", toggleAmbientMusic);
  updateVolumeControls();

  ui.startButton.disabled = false;
  ui.startButton.textContent = "Iniciar juego";
}

function setupAmbientMusic() {
  ambientMusic = new Audio("./assets/sounds/Jard%C3%ADn%20de%20Ecos.mp3");
  ambientMusic.loop = true;
  ambientMusic.volume = 0.32;
  ambientMusic.preload = "auto";
  ambientMusic.autoplay = true;

  const unlockMusic = (event) => {
    if (event.target.closest?.("[data-volume-toggle]")) return;
    document.removeEventListener("pointerdown", unlockMusic);
    document.removeEventListener("keydown", unlockMusic);
    playAmbientMusic();
  };
  document.addEventListener("pointerdown", unlockMusic, { once: true });
  document.addEventListener("keydown", unlockMusic, { once: true });

  // Autoplay puede ser bloqueado; el primer gesto en portada actua como respaldo.
  ambientMusic.play().catch(() => {});
}

function setupSoundEffects() {
  const definitions = {
    transformacion: { path: "./assets/sounds/transformacion.mp3", volume: 0.58 },
    alerta: { path: "./assets/sounds/Alerta.mp3", volume: 0.62 },
    encuentro: { path: "./assets/sounds/encuentro.mp3", volume: 0.56 },
  };

  for (const [name, definition] of Object.entries(definitions)) {
    const audio = new Audio(definition.path);
    audio.preload = "auto";
    audio.volume = definition.volume;
    soundEffects[name] = audio;
  }
}

function playSoundEffect(name) {
  const sound = soundEffects[name];
  if (!sound) return;
  sound.currentTime = 0;
  sound.play().catch((error) => {
    console.warn(`FORMA_01: no se pudo reproducir el sonido ${name}.`, error);
  });
}

function playAmbientMusic() {
  if (!ambientMusic || !ambientMusic.paused) return;
  ambientMusic.play().catch((error) => {
    console.warn("FORMA_01: el navegador bloqueo la musica ambiental. Interactua nuevamente con la pagina para activarla.", error);
  });
}

function toggleAmbientMusic() {
  if (!ambientMusic) return;

  if (ambientMusic.paused) {
    ambientMusic.muted = false;
    playAmbientMusic();
  } else {
    ambientMusic.muted = !ambientMusic.muted;
  }
  updateVolumeControls();
}

function updateVolumeControls() {
  const muted = Boolean(ambientMusic?.muted);
  for (const button of ui.volumeToggles) {
    button.classList.toggle("muted", muted);
    button.classList.toggle("is-muted", muted);
    button.setAttribute("aria-pressed", muted ? "true" : "false");
    button.setAttribute("aria-label", muted ? "Activar musica" : "Silenciar musica");
    button.title = muted ? "Activar musica" : "Silenciar musica";
  }
}

function updatePlayer(delta, elapsed) {
  if (!state.gameStarted || state.ended) return;

  const controlsLocked = state.decisionOpen || state.guardianDialogOpen || state.isTransforming;
  const forward = new THREE.Vector3(0, 0, -1);
  const right = new THREE.Vector3(1, 0, 0);

  player.direction.set(0, 0, 0);
  if (!controlsLocked) {
    if (keys.has("KeyW")) player.direction.add(forward);
    if (keys.has("KeyS")) player.direction.sub(forward);
    if (keys.has("KeyD")) player.direction.add(right);
    if (keys.has("KeyA")) player.direction.sub(right);
  }

  if (player.direction.lengthSq() > 0) {
    player.direction.normalize();
    player.group.rotation.y = Math.atan2(player.direction.x, player.direction.z);
  }

  state.dashCooldown = Math.max(0, state.dashCooldown - delta);
  state.dashTime = Math.max(0, state.dashTime - delta);
  state.transformPulse = Math.max(0, state.transformPulse - delta * 2.7);
  if (!controlsLocked && keys.has("ShiftLeft") && state.dashCooldown === 0 && player.direction.lengthSq() > 0) {
    state.dashTime = 0.16;
    state.dashCooldown = state.caos > 0 ? 0.52 : 0.82;
    playTone(state.caos > 0 ? 116 : 164, 0.08, "sawtooth");
  }

  const dashBoost = state.dashTime > 0 ? (state.caos > 0 ? 7.8 : 4.9) : 0;
  const speed = 4.2 + dashBoost;
  player.velocity.lerp(player.direction.multiplyScalar(speed), 1 - Math.pow(0.0004, delta));
  movePlayerWithCollisions(delta);

  const movementAmount = THREE.MathUtils.clamp(player.velocity.length() / 8, 0, 1);
  let transformationScale = 1;
  if (state.isTransforming) {
    state.transformElapsed += delta;
    const progress = THREE.MathUtils.clamp(state.transformElapsed / 2, 0, 1);
    transformationScale = 1 + Math.sin(progress * Math.PI) * 0.3;
    setTransformationEmission(Math.sin(progress * Math.PI) * 2.4);

    if (progress >= 1) {
      state.isTransforming = false;
      state.transformElapsed = 0;
      setTransformationEmission(0);
      if (state.pendingPortal) {
        state.pendingPortal = false;
        state.guardianReady = true;
        showNarrative("El Guardian del Vacio espera ante el umbral. Debes escuchar su lectura.");
      }
    }
  }
  const pulse = 1 + Math.sin(elapsed * 4.2) * 0.045 + state.transformPulse * 0.24;
  const float = Math.sin(elapsed * 2.15) * 0.16 + Math.sin(elapsed * 0.87) * 0.06;
  const glitchShake = state.caos > 0 ? Math.sin(elapsed * 45) * 0.035 : 0;
  player.group.position.y = player.baseY + float + movementAmount * 0.06;
  player.group.rotation.z = THREE.MathUtils.lerp(player.group.rotation.z, -player.velocity.x * 0.035, 0.08);
  player.group.rotation.x = THREE.MathUtils.lerp(player.group.rotation.x, player.velocity.z * 0.025, 0.08);
  player.visual.scale.set(
    player.baseVisualScale.x * (1 + movementAmount * 0.14 + glitchShake + state.transformPulse * 0.12) * transformationScale,
    player.baseVisualScale.y * (pulse - movementAmount * 0.08) * transformationScale,
    player.baseVisualScale.z * (1 + Math.sin(elapsed * 2.9) * 0.035 - glitchShake) * transformationScale,
  );
  deformBlob(elapsed, movementAmount);
  player.aura.scale.setScalar(1 + state.transformPulse * 0.45 + Math.sin(elapsed * 2.6) * 0.035);
  player.aura.material.opacity = 0.08 + state.energia * 0.0028 + Math.sin(elapsed * 3) * 0.015 + state.transformPulse * 0.18;
  player.aura.rotation.y += delta * 0.6;
  player.shield.rotation.y += delta * 0.9;
  player.shield.rotation.x += delta * 0.35;
  player.shield.material.opacity = THREE.MathUtils.lerp(player.shield.material.opacity, state.shieldActive ? 0.42 : 0, 0.08);

  const desiredPosition = player.group.position.clone().add(thirdPersonOffset);
  const safeCameraPosition = getCollisionSafeCameraPosition(player.group.position, desiredPosition);
  camera.position.lerp(safeCameraPosition, 0.08);
  camera.lookAt(player.group.position);

  if (portalActive && player.group.position.distanceTo(portal.position) < 1.65) {
    showEnding();
  }
}

function getCollisionSafeCameraPosition(target, desiredPosition) {
  const direction = desiredPosition.clone().sub(target);
  const desiredDistance = direction.length();
  if (desiredDistance === 0) return desiredPosition;

  direction.normalize();
  cameraRay.set(target, direction);
  let allowedDistance = desiredDistance;
  const hit = new THREE.Vector3();

  for (const box of wallColliders) {
    const intersection = cameraRay.intersectBox(box, hit);
    if (!intersection) continue;
    const distance = target.distanceTo(intersection);
    if (distance > 0.35 && distance < allowedDistance) {
      allowedDistance = Math.max(0.45, distance - 0.2);
    }
  }

  return target.clone().addScaledVector(direction, allowedDistance);
}

function checkInteractions(consume = false) {
  if (!state.gameStarted || state.ended || state.decisionOpen || state.guardianDialogOpen || state.isTransforming) return;

  if (guardianNPC && state.guardianReady && !state.guardianSpoken) {
    const guardianDistance = guardianNPC.position.distanceTo(player.group.position);
    if (guardianDistance < 3.15) {
      ui.interaction.textContent = "Presiona E para escuchar al Guardian";
      ui.interaction.classList.remove("hidden");
      guardianNPC.userData.label.visible = true;
      if (consume) openGuardianDialog();
      return;
    }
  }

  currentInteractable = null;
  let nearestDistance = Infinity;

  for (const item of interactables) {
    if (item.userData.absorbed) continue;

    const distance = item.position.distanceTo(player.group.position);
    item.userData.label.visible = distance < 3.1;
    item.userData.halo.material.opacity = distance < 3.1 ? 0.62 : 0.34;

    if (distance < 2.35 && distance < nearestDistance) {
      nearestDistance = distance;
      currentInteractable = item;
    }
  }

  if (currentInteractable && state.objetosAbsorbidos.length < 2) {
    ui.interaction.textContent = "Presiona E para absorber";
    ui.interaction.classList.remove("hidden");
    if (consume) openDecision(currentInteractable);
  } else {
    ui.interaction.classList.add("hidden");
  }
}

function openGuardianDialog() {
  const reading = getGuardianReading();
  state.guardianDialogOpen = true;
  keys.clear();
  player.velocity.set(0, 0, 0);
  ui.guardianReading.textContent = reading.type;
  ui.guardianCopy.textContent = reading.copy;
  ui.guardianDialog.classList.remove("hidden");
  ui.interaction.classList.add("hidden");
  playSoundEffect("encuentro");
  playTone(146, 0.28, "sine");
}

function closeGuardianDialog() {
  if (!state.guardianDialogOpen) return;
  state.guardianDialogOpen = false;
  state.guardianSpoken = true;
  state.guardianReady = false;
  ui.guardianDialog.classList.add("hidden");
  activatePortal();
}

function getGuardianReading() {
  const choices = [...state.objetosAbsorbidos].sort().join("+");
  const readings = {
    "cristal+luz": {
      type: "Final Orden",
      copy: "Elegiste Luz y Cristal. La Luz te dio claridad; el Cristal, limites. Construiste una identidad capaz de iluminar sin perder su centro. Tu orden no es obediencia: es una forma elegida de permanecer.",
    },
    "glitch+luz": {
      type: "Final Expansion",
      copy: "Elegiste Luz y Glitch. La Luz te dio impulso; el Glitch, la capacidad de romper tus bordes. Construiste una identidad que no teme cambiar. Expandirte significa aceptar que ninguna forma tiene que ser definitiva.",
    },
    "cristal+glitch": {
      type: "Final Tension",
      copy: "Elegiste Cristal y Glitch. Uno busca estructura; el otro, ruptura. Construiste una identidad que sostiene ambas fuerzas sin negar ninguna. Tu tension no es una falla: es el control consciente dentro del caos.",
    },
    "glitch+glitch": {
      type: "Final Ruptura",
      copy: "Elegiste el Glitch dos veces. Rechazaste todo borde estable y convertiste el cambio en tu unica certeza. No encontraste una forma final: elegiste transformarte sin pedir permiso.",
    },
  };

  return readings[choices] || {
    type: "Lectura incompleta",
    copy: "Tus elecciones aun no forman un significado completo. El vacio espera una segunda decision.",
  };
}

function openDecision(item) {
  if (!item || state.objetosAbsorbidos.length >= 2) return;

  const essenceNames = {
    luz: "una Esencia de Luz",
    glitch: "una Esencia Glitch",
    cristal: "un Nucleo de Cristal",
  };
  pendingDecision = item;
  state.decisionOpen = true;
  keys.clear();
  player.velocity.set(0, 0, 0);
  ui.decisionTitle.textContent = `Has absorbido ${essenceNames[item.userData.id]}`;
  ui.decisionCopy.textContent = "Puedes integrarla a tu identidad o dejarla intacta.";
  ui.decision.classList.remove("hidden");
  ui.interaction.classList.add("hidden");
}

function closeDecision() {
  state.decisionOpen = false;
  pendingDecision = null;
  ui.decision.classList.add("hidden");
}

async function absorbObject(item) {
  if (!item || item.userData.absorbed || state.objetosAbsorbidos.length >= 2) return;

  item.userData.absorbed = true;
  item.visible = false;
  state.objetosAbsorbidos.push(item.userData.id);
  state.afinidades[item.userData.id] += 1;

  if (item.userData.id === "luz") {
    state.energia += 45;
    player.aura.material.color.set(0xff4fd8);
    showNarrative("La luz suaviza tus bordes. Brillas un poco mas.");
    playTone(440, 0.22, "sine");
  }

  if (item.userData.id === "glitch") {
    state.caos += 1;
    spawnGlitchParticles();
    showNarrative("El ruido te atraviesa. Tu impulso se estira.");
    playTone(92, 0.18, "square");
  }

  if (item.userData.id === "cristal") {
    state.estabilidad += 1;
    state.shieldActive = true;
    showNarrative("El nucleo fija tu pulso. Algo te protege.");
    playTone(330, 0.24, "triangle");
  }

  const evolution = getEvolution();
  state.formaActual = evolution.name;
  await replacePlayerModel(evolution.path, evolution.name);

  if (state.objetosAbsorbidos.length === 2) state.pendingPortal = true;
  updateHUD();
}

function getEvolution() {
  const { luz, cristal, glitch } = state.afinidades;

  if (glitch >= 2) {
    return { name: "Glitch dominante", path: "./assets/models/Forma_GlitchGlitch.glb", color: 0x36c8ff };
  }
  if (luz > 0 && cristal > 0) {
    return { name: "Luz + Cristal", path: "./assets/models/Forma_LuzCristal.glb", color: 0xff9de8 };
  }
  if (luz > 0 && glitch > 0) {
    return { name: "Glitch + Luz", path: "./assets/models/Forma_GlitchLuz.glb", color: 0xb977ff };
  }

  if (cristal > 0 && glitch > 0) {
    return {
      name: "Glitch + Cristal",
      path: "./assets/models/Forma_GlitchCristal.glb",
      color: 0x69bfff,
    };
  }
  if (luz > 0) return { name: "Luz", path: "./assets/models/Forma_Luz.glb", color: 0xff68dd };
  if (cristal > 0) return { name: "Cristal", path: "./assets/models/Forma_Cristal.glb", color: 0x8defff };
  return { name: "Glitch", path: "./assets/models/Forma_Glitch.glb", color: 0x36c8ff };
}

async function replacePlayerModel(path, evolutionName) {
  state.isTransforming = true;
  state.transformElapsed = 0;
  state.transformPulse = 1;
  keys.clear();
  player.velocity.set(0, 0, 0);
  playSoundEffect("transformacion");

  const preservedPosition = player.group.position.clone();
  const preservedQuaternion = player.group.quaternion.clone();
  const preservedScale = player.group.scale.clone();
  const fallback = createBlobPlaceholder();
  const nextVisual = await loadModel(path, fallback, evolutionName);

  fitModelToBox(nextVisual, 1.7, PLAYER_MODEL_BOTTOM);
  nextVisual.scale.multiplyScalar(1.05);
  const nextBaseScale = nextVisual.scale.clone();
  const nextDeformMeshes = collectDeformableMeshes(nextVisual);

  player.group.remove(player.visual);
  player.group.add(nextVisual);
  player.visual = nextVisual;
  player.blob = nextDeformMeshes[0] || nextVisual;
  player.deformMeshes = nextDeformMeshes;
  player.baseVisualScale.copy(nextBaseScale);

  player.group.position.copy(preservedPosition);
  player.group.quaternion.copy(preservedQuaternion);
  player.group.scale.copy(preservedScale);

  prepareTransformationMaterials(nextVisual);
  spawnTransformationParticles(getEvolutionColor());
  state.transformElapsed = 0;
  state.isTransforming = true;
}

function prepareTransformationMaterials(object) {
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!("emissive" in material)) continue;
      material.userData.formaBaseEmissive = material.emissiveIntensity ?? 0;
    }
  });
}

function setTransformationEmission(boost) {
  player.visual.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!("emissive" in material)) continue;
      if (material.userData.formaBaseEmissive === undefined) {
        material.userData.formaBaseEmissive = material.emissiveIntensity ?? 0;
      }
      const base = material.userData.formaBaseEmissive;
      material.emissiveIntensity = base + boost;
    }
  });
}

function getEvolutionColor() {
  const { luz, cristal, glitch } = state.afinidades;
  if (luz > 0 && cristal > 0) return 0xff9de8;
  if (luz > 0 && glitch > 0) return 0xb977ff;
  if (cristal > 0) return 0x8defff;
  if (glitch > 0) return 0x36c8ff;
  return 0xff68dd;
}

function spawnTransformationParticles(color) {
  for (let i = 0; i < 48; i += 1) {
    const mote = new THREE.Mesh(
      new THREE.SphereGeometry(THREE.MathUtils.randFloat(0.025, 0.075), 10, 8),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const direction = new THREE.Vector3().randomDirection();
    mote.position.copy(player.group.position).addScaledVector(direction, THREE.MathUtils.randFloat(0.3, 1));
    mote.userData.velocity = direction.multiplyScalar(THREE.MathUtils.randFloat(0.35, 1.4));
    mote.userData.life = 2;
    mote.userData.maxLife = 2;
    scene.add(mote);
    particles.push({ mesh: mote, burst: true, weightless: true });
  }
}

function activateTransformation() {
  if (!state.gameStarted || state.ended || state.decisionOpen || state.guardianDialogOpen || state.isTransforming) return;
  state.transformPulse = 1;
  if (state.shieldActive) {
    player.shield.scale.setScalar(1.55);
    setTimeout(() => player.shield.scale.setScalar(1), 220);
    playTone(260, 0.08, "triangle");
  }
  if (state.caos > 0) {
    state.dashTime = 0.18;
    state.dashCooldown = 0.1;
    spawnGlitchParticles();
  }
  if (state.energia > 0) {
    player.aura.material.opacity = 0.36;
    playTone(520, 0.08, "sine");
  }
}

function spawnGlitchParticles() {
  for (let i = 0; i < 14; i += 1) {
    const shard = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.22),
      new THREE.MeshBasicMaterial({
        color: i % 2 ? 0x36c8ff : 0xff4fd8,
        transparent: true,
        opacity: 0.8,
      }),
    );
    shard.position.copy(player.group.position);
    shard.position.y += THREE.MathUtils.randFloat(0.1, 0.9);
    shard.userData.velocity = new THREE.Vector3(THREE.MathUtils.randFloatSpread(3), THREE.MathUtils.randFloat(1, 3), THREE.MathUtils.randFloatSpread(3));
    shard.userData.life = 1.4;
    scene.add(shard);
    particles.push({ mesh: shard, burst: true });
  }
}

function activatePortal() {
  portalActive = true;
  portal.visible = true;
  ui.interaction.classList.add("hidden");
  showNarrative("El Guardian reconoce tu forma. El umbral se abre.");
  playTone(174, 0.32, "sine");
}

function updateHUD() {
  ui.timer.textContent = formatTime(state.timeRemaining);
  ui.status.textContent = state.formaActual;
  ui.absorbed.textContent = `${state.objetosAbsorbidos.length}/2`;
}

function updateGameTimer(delta) {
  if (!state.gameStarted || state.ended) return;

  state.timeRemaining = Math.max(0, state.timeRemaining - delta);
  collectNearbyTimeOrb();
  ui.timer.textContent = formatTime(state.timeRemaining);
  ui.timer.classList.toggle("timer-warning", state.timeRemaining <= 10);

  if (state.timeRemaining <= 10 && state.timeRemaining > 0 && !state.timerAlertPlayed) {
    state.timerAlertPlayed = true;
    playSoundEffect("alerta");
  } else if (state.timeRemaining > 10) {
    state.timerAlertPlayed = false;
  }

  if (state.timeRemaining <= 0) showTimeExpired();
}

function formatTime(seconds) {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

function collectNearbyTimeOrb() {
  for (const orb of timeOrbs) {
    if (orb.collected || !orb.object.visible) continue;

    const horizontalDistance = Math.hypot(
      player.group.position.x - orb.position.x,
      player.group.position.z - orb.position.z,
    );
    const verticalDistance = Math.abs(player.group.position.y - orb.position.y);
    if (horizontalDistance > 0.9 || verticalDistance > 1.45) continue;

    orb.collected = true;
    orb.object.visible = false;
    state.timeRemaining += 10;
    spawnTimeOrbParticles(orb.position);
    showNarrative("Esfera temporal absorbida. +10 segundos.");
    playTone(620, 0.14, "sine");
    break;
  }
}

function spawnTimeOrbParticles(position) {
  for (let i = 0; i < 14; i += 1) {
    const mote = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 6),
      new THREE.MeshBasicMaterial({
        color: i % 2 ? 0xd778ff : 0x8f36ff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const direction = new THREE.Vector3().randomDirection();
    mote.position.copy(position);
    mote.userData.velocity = direction.multiplyScalar(THREE.MathUtils.randFloat(0.6, 1.8));
    mote.userData.life = 0.85;
    mote.userData.maxLife = 0.85;
    scene.add(mote);
    particles.push({ mesh: mote, burst: true, weightless: true });
  }
}

function showTimeExpired() {
  state.ended = true;
  keys.clear();
  player.velocity.set(0, 0, 0);
  ui.decision.classList.add("hidden");
  ui.guardianDialog.classList.add("hidden");
  ui.interaction.classList.add("hidden");
  ui.endingType.textContent = "Tiempo agotado";
  ui.endingTitle.textContent = "El Vacio te alcanzo";
  ui.endingCopy.textContent = "Tu forma se detuvo antes de completar sus decisiones.";
  ui.ending.classList.remove("hidden");
  playTone(82, 0.5, "sine");
}

function showEnding() {
  state.ended = true;
  ui.ending.classList.remove("hidden");

  const choices = [...state.objetosAbsorbidos].sort().join("+");
  const endings = {
    "cristal+luz": {
      type: "Final Orden",
      title: "Claridad Estable",
      copy: "Elegiste estabilidad y claridad.",
    },
    "glitch+luz": {
      type: "Final Expansion",
      title: "Energia Mutante",
      copy: "Elegiste energia y cambio.",
    },
    "cristal+glitch": {
      type: "Final Tension",
      title: "Control del Ruido",
      copy: "Elegiste control dentro del caos.",
    },
    "glitch+glitch": {
      type: "Final Ruptura",
      title: "Glitch Dominante",
      copy: "Elegiste el cambio hasta dejar atras toda forma estable.",
    },
  };
  const ending = endings[choices] || endings["cristal+luz"];

  ui.endingType.textContent = ending.type;
  ui.endingTitle.textContent = ending.title;
  ui.endingCopy.textContent = ending.copy;
  playTone(196, 0.36, "sine");
}

function showNarrative(message) {
  ui.narrative.textContent = message;
  ui.narrative.classList.remove("hidden");
  clearTimeout(showNarrative.timeout);
  showNarrative.timeout = setTimeout(() => ui.narrative.classList.add("hidden"), 4200);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.04);
  const elapsed = clock.elapsedTime;

  if (!state.gameStarted && introScene) {
    animateIntro(delta, elapsed);
    renderer.render(introScene, introCamera);
    return;
  }

  updateGameTimer(delta);
  updatePlayer(delta, elapsed);
  checkInteractions(false);
  animateWorld(delta, elapsed);

  if (debugControls.enabled) {
    debugControls.target.copy(player.group.position);
    debugControls.update();
  }
  renderer.render(scene, camera);
}

function animateIntro(delta, elapsed) {
  const dialogueCycle = elapsed % 9;
  for (let index = 0; index < introCharacters.length; index += 1) {
    const character = introCharacters[index];
    character.position.y = character.userData.baseY + Math.sin(elapsed * 1.35 + character.userData.phase) * 0.07;
    if (index < 2) {
      const lookAtProtagonist = 0.5 + Math.sin(elapsed * 0.55 + character.userData.phase) * 0.045;
      character.userData.model.rotation.y = THREE.MathUtils.lerp(
        character.userData.model.rotation.y,
        lookAtProtagonist,
        0.035,
      );

      const opacity = index === 0
        ? getDialogueOpacity(dialogueCycle, 0.4, 3.8)
        : getDialogueOpacity(dialogueCycle, 4.5, 8.2);
      if (character.userData.speech) {
        character.userData.speech.material.opacity = opacity;
        character.userData.speech.visible = opacity > 0.01;
      }
    } else {
      character.userData.model.rotation.y = Math.sin(elapsed * 0.42 + character.userData.phase) * 0.08;
    }
    const pedestal = character.children[1];
    if (pedestal) pedestal.rotation.y += delta * 0.35;
  }

  const stars = introScene.getObjectByName("IntroStars");
  if (stars) stars.rotation.y += delta * 0.012;

  const crystals = introScene.getObjectByName("IntroCrystals");
  if (crystals) {
    for (const crystal of crystals.children) {
      crystal.rotation.y += delta * 0.35;
      crystal.rotation.x += delta * 0.08;
      crystal.position.y += Math.sin(elapsed * 0.7 + crystal.userData.phase) * delta * 0.018;
    }
  }
}

function getDialogueOpacity(cycle, start, end) {
  if (cycle < start || cycle > end) return 0;
  const fadeDuration = 0.45;
  const fadeIn = THREE.MathUtils.clamp((cycle - start) / fadeDuration, 0, 1);
  const fadeOut = THREE.MathUtils.clamp((end - cycle) / fadeDuration, 0, 1);
  return Math.min(fadeIn, fadeOut);
}

function updateIntroCamera() {
  if (!introCamera) return;
  const aspect = window.innerWidth / window.innerHeight;
  introCamera.aspect = aspect;
  introCamera.position.set(0.35, aspect < 0.8 ? 4.2 : 3.7, aspect < 0.8 ? 26 : 17.2);
  introCamera.lookAt(0.35, 1.45, 0);
  introCamera.updateProjectionMatrix();
}

function animateWorld(delta, elapsed) {
  for (const item of interactables) {
    if (item.userData.absorbed) continue;
    item.rotation.y += delta * 0.62;
    item.position.y = item.userData.baseY + Math.sin(elapsed * 1.7 + item.position.x) * 0.08;
    item.userData.label.lookAt(camera.position);
  }

  for (const npc of npcs) {
    const distance = npc.position.distanceTo(player.group.position);
    npc.userData.label.visible = distance < 4.2;
    npc.userData.label.lookAt(camera.position);
    npc.position.y = npc.userData.baseY + Math.sin(elapsed * 1.15 + npc.userData.phase) * 0.08;
    tempVector.copy(player.group.position);
    tempVector.y = npc.position.y;
    npc.lookAt(tempVector);
  }

  if (portalActive) {
    portal.rotation.y += delta * 1.35;
    portal.children[0].rotation.z -= delta * 0.9;
    portal.children[1].rotation.x += delta * 1.45;
    portal.children[2].rotation.y -= delta * 1.85;
    portal.children[3].material.opacity = 0.18 + Math.sin(elapsed * 4.6) * 0.06;
    portal.children[4].rotation.z += delta * 0.6;
    portal.scale.setScalar(1.05 + Math.sin(elapsed * 3) * 0.095);
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    if (particle.points) {
      particle.points.rotation.y += particle.drift * delta;
      continue;
    }

    if (!particle.mesh) continue;

    if (particle.burst) {
      particle.mesh.userData.life -= delta;
      particle.mesh.position.addScaledVector(particle.mesh.userData.velocity, delta);
      if (!particle.weightless) particle.mesh.userData.velocity.y -= delta * 2.2;
      const maxLife = particle.mesh.userData.maxLife ?? 1.4;
      particle.mesh.material.opacity = Math.max(0, particle.mesh.userData.life / maxLife);
      particle.mesh.rotation.x += delta * 8;
      particle.mesh.rotation.y += delta * 10;
      if (particle.mesh.userData.life <= 0) {
        scene.remove(particle.mesh);
        particles.splice(i, 1);
      }
      continue;
    }

    if (particle.slow) {
      particle.mesh.position.y = particle.mesh.userData.baseY + Math.sin(elapsed * particle.mesh.userData.speed + particle.phase) * 0.38;
      particle.mesh.position.x += Math.sin(elapsed * 0.18 + particle.phase) * particle.mesh.userData.radius * delta;
      particle.mesh.position.z += Math.cos(elapsed * 0.16 + particle.phase) * particle.mesh.userData.radius * delta;
      particle.mesh.rotation.y += delta * 0.16;
      continue;
    }

    particle.mesh.position.y = particle.mesh.userData.baseY + Math.sin(elapsed * 0.9 + particle.phase) * 0.22;
    particle.mesh.rotation.y += delta;
  }
}

function deformBlob(elapsed, movementAmount) {
  const chaosAmount = state.caos > 0 ? 0.055 : 0.018;
  const energyAmount = state.energia > 0 ? 0.018 : 0;
  const pulseAmount = state.transformPulse * 0.08;

  for (const mesh of player.deformMeshes) {
    const position = mesh.geometry.attributes.position;
    const base = mesh.geometry.userData.basePositions;
    if (!position || !base) continue;

    for (let i = 0; i < position.count; i += 1) {
      const ix = i * 3;
      const x = base[ix];
      const y = base[ix + 1];
      const z = base[ix + 2];
      const wave =
        Math.sin(elapsed * 2.8 + x * 4.1 + y * 1.7) * 0.026 +
        Math.cos(elapsed * 2.1 + z * 5.3) * 0.022 +
        Math.sin(elapsed * 5.6 + i * 0.17) * chaosAmount;
      const movementWave = Math.sin(elapsed * 8 + z * 3.4) * movementAmount * 0.04;
      const scale = 1 + wave + movementWave + energyAmount + pulseAmount;
      position.array[ix] = x * scale;
      position.array[ix + 1] = y * (scale + Math.sin(elapsed * 3.3 + x * 2) * 0.018);
      position.array[ix + 2] = z * scale;
    }

    position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }
}

function playTone(frequency, duration, type) {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration + 0.03);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateIntroCamera();
}

// Loads production GLB assets and keeps the geometry placeholder as a safe fallback.
function loadModel(path, fallback, displayName = path, alternatePaths = []) {
  const loader = new GLTFLoader();
  const paths = [path, ...alternatePaths];

  return new Promise((resolve) => {
    const tryPath = (index) => {
      const currentPath = paths[index];
      loader.load(
        currentPath,
        (gltf) => {
          console.info(`FORMA_01: modelo cargado correctamente: ${currentPath}`);
          resolve(gltf.scene);
        },
        undefined,
        (error) => {
          if (index < paths.length - 1) {
            console.warn(`FORMA_01: no se pudo cargar ${currentPath}. Probando ruta alternativa.`, error);
            tryPath(index + 1);
            return;
          }

          console.error(`FORMA_01: no se pudo cargar ${displayName}. Se usara el placeholder temporal.`, error);
          resolve(fallback);
        },
      );
    };

    tryPath(0);
  });
}
