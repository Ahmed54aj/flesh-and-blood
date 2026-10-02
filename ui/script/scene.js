import * as THREE from 'three';

const W = 0.7, H = 0.98, T = 0.012;
const MAT_TOP = 0.1;
const PITCH = { 0: '#6b6358', 1: '#a3202a', 2: '#c9a227', 3: '#2f5d8a' };
const PREVIEW_POSITION = new THREE.Vector3(0, 2.2, 0.3);
const PREVIEW_SCALE = new THREE.Vector3(4, 4, 4);
const PREVIEW_ROTATION = new THREE.Euler(0.95, 0, 0);
const D20_RADIUS = 0.68;
const D20_REST_Y = D20_RADIUS * 0.85;
const geo = new THREE.BoxGeometry(W, T, H); // lies flat; +y is the face, text reads toward +z

function d20NumberTexture(number) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#2a2119';
  context.beginPath();
  context.arc(64, 64, 48, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#b8913f';
  context.lineWidth = 5;
  context.stroke();
  context.fillStyle = '#fff2dd';
  context.font = 'bold 52px Georgia, serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(number), 64, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createD20() {
  const sourceGeometry = new THREE.IcosahedronGeometry(D20_RADIUS, 0);
  const geometry = sourceGeometry.index ? sourceGeometry.toNonIndexed() : sourceGeometry;
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: '#d8bd82',
    metalness: 0.55,
    roughness: 0.3,
    flatShading: true,
  }));
  mesh.add(body);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: '#4a3020' }),
  );
  mesh.add(edges);

  const normals = [];
  const vertices = geometry.attributes.position;
  for (let face = 0; face < 20; face++) {
    const first = new THREE.Vector3().fromBufferAttribute(vertices, face * 3);
    const second = new THREE.Vector3().fromBufferAttribute(vertices, face * 3 + 1);
    const third = new THREE.Vector3().fromBufferAttribute(vertices, face * 3 + 2);
    const center = first.clone().add(second).add(third).multiplyScalar(1 / 3);
    const normal = center.clone().normalize();
    normals.push(normal);

    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.36),
      new THREE.MeshBasicMaterial({
        map: d20NumberTexture(face + 1),
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    label.position.copy(center).multiplyScalar(1.015);
    label.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    mesh.add(label);
  }
  return { mesh, normals };
}

function canvasTex(draw) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 358;
  draw(c.getContext('2d'), c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function wrap(g, text, x, y, maxW, lh) {
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > maxW && line) { g.fillText(line, x, y); y += lh; line = word; }
    else line = test;
  }
  g.fillText(line, x, y);
}

const backTex = canvasTex((g, w, h) => {
  g.fillStyle = '#1a1512'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#a3202a'; g.lineWidth = 6; g.strokeRect(14, 14, w - 28, h - 28);
  g.beginPath(); g.arc(w / 2, h / 2, 44, 0, Math.PI * 2); g.stroke();
});

const faceCache = new Map();
function faceTex({ name, pitch = 0, label }) {
  const key = `${name}|${pitch}|${label}`;
  if (!faceCache.has(key)) faceCache.set(key, canvasTex((g, w, h) => {
    g.fillStyle = '#eadfc8'; g.fillRect(0, 0, w, h);
    g.fillStyle = PITCH[pitch]; g.fillRect(0, 0, w, 54);
    g.fillStyle = '#14110f'; g.font = '600 26px Georgia, serif'; g.textAlign = 'center';
    wrap(g, name, w / 2, 110, w - 36, 30);
    g.font = 'italic 20px Georgia, serif'; g.fillStyle = '#5a4f42';
    g.fillText(label || (pitch ? `Pitch ${pitch}` : ''), w / 2, h - 28);
  }));
  return faceCache.get(key);
}

function zoneTex(label, width = 256, height = 358) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(25, 17, 12, 0.72)';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#b8913f';
  context.lineWidth = 5;
  context.strokeRect(9, 9, width - 18, height - 18);
  context.fillStyle = '#eadfc8';
  context.font = `${width > 300 ? 38 : 24}px "IM Fell English", Georgia, serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label.toUpperCase(), width / 2, height / 2, width - 24);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function defaultPlaymatTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  context.fillStyle = '#171817';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 9000; i++) {
    const shade = 25 + Math.floor(Math.random() * 20);
    context.fillStyle = `rgba(${shade}, ${shade}, ${shade}, 0.22)`;
    context.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function roundedMatShape(width, height) {
  const radius = 0.16;
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2 + radius, -height / 2);
  shape.lineTo(width / 2 - radius, -height / 2);
  shape.quadraticCurveTo(width / 2, -height / 2, width / 2, -height / 2 + radius);
  shape.lineTo(width / 2, height / 2 - radius);
  shape.quadraticCurveTo(width / 2, height / 2, width / 2 - radius, height / 2);
  shape.lineTo(-width / 2 + radius, height / 2);
  shape.quadraticCurveTo(-width / 2, height / 2, -width / 2, height / 2 - radius);
  shape.lineTo(-width / 2, -height / 2 + radius);
  shape.quadraticCurveTo(-width / 2, -height / 2, -width / 2 + radius, -height / 2);
  return shape;
}

function roundedMatGeometry(width, height) {
  const geometry = new THREE.ExtrudeGeometry(roundedMatShape(width, height), {
    depth: 0.065, bevelEnabled: true, bevelSegments: 3, steps: 1,
    bevelSize: 0.035, bevelThickness: 0.035,
  });
  geometry.computeVertexNormals();
  return geometry;
}

function roundedMatSurfaceGeometry(width, height) {
  const geometry = new THREE.ShapeGeometry(roundedMatShape(width - 0.06, height - 0.06), 8);
  const positions = geometry.attributes.position;
  const uvs = geometry.attributes.uv;
  for (let i = 0; i < positions.count; i++) {
    uvs.setXY(i, positions.getX(i) / width + 0.5, positions.getY(i) / height + 0.5);
  }
  uvs.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

const side = new THREE.MeshStandardMaterial({ color: '#1a1512' });
const std = (map) => new THREE.MeshStandardMaterial({ map });

export function createStage(host, cardBackUrl) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.appendChild(renderer.domElement);
  const textureLoader = new THREE.TextureLoader();
  const textureCache = new Map();
  const textureFor = (url) => {
    if (!textureCache.has(url)) {
      const texture = textureLoader.load(url, undefined, undefined, () => console.warn(`Could not load card image: ${url}`));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      textureCache.set(url, texture);
    }
    return textureCache.get(url);
  };
  const cardBack = textureFor(cardBackUrl);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#14110f');
  const diceGroup = new THREE.Group();
  scene.add(diceGroup);
  const diceAnimations = [];
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
  camera.position.set(0, 9, 6.5);
  camera.lookAt(0, 0, 0.3);
  scene.add(new THREE.HemisphereLight('#fff2dd', '#201a14', 1.2));
  const key = new THREE.DirectionalLight('#ffe6c0', 1.6);
  key.position.set(3, 8, 4);
  scene.add(key);

  const table = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), new THREE.MeshStandardMaterial({ color: '#2a2119' }));
  table.rotation.x = -Math.PI / 2; table.position.y = -0.01;
  scene.add(table);

  const group = new THREE.Group();
  scene.add(group);
  const layout = new THREE.Group();
  scene.add(layout);
  const matSurfaceTexture = defaultPlaymatTexture();
  const matSurfaceMaterial = new THREE.MeshStandardMaterial({ map: matSurfaceTexture, roughness: 0.88, metalness: 0.08 });
  const matEdgeMaterial = new THREE.MeshStandardMaterial({ color: '#090a09', roughness: 0.55, metalness: 0.12 });
  const matMeshes = [];
  let uploadedMatTexture = null;
  let playmatImageRequest = 0;
  const tweens = [];
  const clickableCards = [];
  const yourHand = [];
  let hovered = null;
  let preview = null;
  let initiativeActive = false;
  let boardScaleX = 1;

  function resize() {
    const { clientWidth: w, clientHeight: h } = host;
    const aspect = w / h;
    const nextScale = THREE.MathUtils.clamp(aspect / 1.08, 0.32, 1);
    if (nextScale !== boardScaleX) {
      const ratio = nextScale / boardScaleX;
      for (const mesh of group.children) {
        mesh.position.x *= ratio;
        if (mesh.userData.restPosition) mesh.userData.restPosition.x *= ratio;
      }
      for (const mesh of layout.children) mesh.position.x *= ratio;
      for (const mat of matMeshes) mat.scale.x *= ratio;
      for (const tween of tweens) {
        tween.from.x *= ratio;
        tween.to.x *= ratio;
      }
      if (preview) preview.sourcePosition.x *= ratio;
      for (const die of diceGroup.children) die.position.x *= ratio;
      for (const animation of diceAnimations) {
        animation.startPosition.x *= ratio;
        animation.targetPosition.x *= ratio;
      }
      boardScaleX = nextScale;
    }
    renderer.setSize(w, h);
    camera.aspect = aspect;
    const cameraFactor = aspect < 0.68 ? 1.16 : aspect < 1 ? 1.06 : 1;
    camera.position.set(0, 9 * cameraFactor, 6.5 * cameraFactor);
    camera.lookAt(0, 0, 0.3);
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  function makeCard(card, faceUp) {
    const top = std(faceUp ? (card.image ? textureFor(card.image) : faceTex(card)) : cardBack);
    const m = new THREE.Mesh(geo, [side, side, top, std(cardBack), side, side]);
    m.userData = { base: 0, card };
    group.add(m);
    return m;
  }

  function moveTo(mesh, to, ms = 600, delay = 0) {
    mesh.userData.settled = false;
    tweens.push({ mesh, from: mesh.position.clone(), to, start: performance.now() + delay, ms });
  }

  function makeDeckStack(x, z, count) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(W, 1, H), [side, side, std(cardBack), side, side, side]);
    mesh.position.set(x, 0, z);
    group.add(mesh);
    const set = (n) => { mesh.visible = n > 0; mesh.scale.y = Math.max(n * T, 0.001); mesh.position.y = MAT_TOP + mesh.scale.y / 2; };
    set(count);
    return { set, top: () => new THREE.Vector3(x, MAT_TOP + mesh.scale.y + T, z) };
  }

  const zones = {
    head: [-3.5, 1.32], graveyard: [3.5, 1.32],
    chest: [-3.5, 2.55], arms: [-2.5, 2.55], weaponLeft: [-1, 2.55],
    hero: [0, 2.55], weaponRight: [1, 2.55],
    pitch: [2.5, 2.55], deck: [3.5, 2.55],
    legs: [-3.5, 3.78], arsenal: [0, 3.78], banished: [3.5, 3.78],
  };

  for (const sideSign of [-1, 1]) {
    const mat = new THREE.Mesh(roundedMatGeometry(8.3, 4.9), matEdgeMaterial);
    mat.position.set(0, 0, sideSign * 2.55);
    mat.rotation.x = -Math.PI / 2;
    layout.add(mat);
    matMeshes.push(mat);

    const surface = new THREE.Mesh(roundedMatSurfaceGeometry(8.3, 4.9), matSurfaceMaterial);
    surface.position.set(0, MAT_TOP + 0.001, sideSign * 2.55);
    surface.rotation.set(-Math.PI / 2, sideSign < 0 ? Math.PI : 0, 0);
    layout.add(surface);
  }

  function makeZone(label, x, z, sideSign, width = 0.94, height = 1.18) {
    const material = new THREE.MeshBasicMaterial({
      map: zoneTex(label), transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const marker = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    marker.position.set(x * sideSign * boardScaleX, MAT_TOP + 0.002, z * sideSign);
    marker.rotation.set(-Math.PI / 2, sideSign < 0 ? Math.PI : 0, 0);
    marker.userData.zoneMarker = true;
    layout.add(marker);
  }

  function createBoardLayout() {
    const chain = new THREE.Mesh(
      new THREE.PlaneGeometry(10.5, 0.62),
      new THREE.MeshBasicMaterial({ map: zoneTex('Combat Chain', 1024, 128), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    chain.position.y = MAT_TOP + 0.002;
    chain.rotation.x = -Math.PI / 2;
    chain.userData.zoneMarker = true;
    layout.add(chain);
    for (const sideSign of [-1, 1]) {
      for (const [key, [x, z]] of Object.entries(zones)) {
        const label = key.startsWith('weapon') ? 'Weapon' : key;
        makeZone(label, x, z, sideSign);
      }
    }
  }
  createBoardLayout();

  function setPlaymatOptions({ showZones = true, imageUrl = '' } = {}) {
    const imageRequest = ++playmatImageRequest;
    for (const marker of layout.children) {
      if (marker.userData.zoneMarker) marker.visible = showZones;
    }
    if (uploadedMatTexture) {
      uploadedMatTexture.dispose();
      uploadedMatTexture = null;
    }
    matSurfaceMaterial.map = matSurfaceTexture;
    matSurfaceMaterial.needsUpdate = true;
    if (imageUrl) {
      uploadedMatTexture = textureLoader.load(imageUrl, (texture) => {
        if (imageRequest !== playmatImageRequest) {
          texture.dispose();
          URL.revokeObjectURL(imageUrl);
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        matSurfaceMaterial.map = texture;
        matSurfaceMaterial.needsUpdate = true;
        URL.revokeObjectURL(imageUrl);
      }, undefined, () => {
        URL.revokeObjectURL(imageUrl);
        console.warn('Could not load the selected playmat image.');
      });
    }
  }

  function rollInitiative(onStatus = () => {}) {
    return new Promise((resolve) => {
      initiativeActive = true;
      hovered = null;
      const youDie = createD20();
      const npcDie = createD20();
      youDie.mesh.position.set(-1.5 * boardScaleX, D20_REST_Y, 2.4);
      npcDie.mesh.position.set(1.5 * boardScaleX, D20_REST_Y, -2.4);
      diceGroup.add(youDie.mesh, npcDie.mesh);

      const canvas = renderer.domElement;
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const planePoint = new THREE.Vector3();
      let phase = 'you';
      let drag = null;

      const projectToTable = (event) => {
        updatePointer(event);
        return ray.ray.intersectPlane(plane, planePoint) ? planePoint.clone() : null;
      };

      const finish = (results) => {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
        canvas.style.cursor = 'default';
        initiativeActive = false;
        resolve(results);
      };

      const animateDie = (die, result, target, throwVector, onComplete) => {
        const axis = new THREE.Vector3(-throwVector.z, 0.35, throwVector.x).normalize();
        if (!axis.length()) axis.set(1, 0.3, 0.4).normalize();
        const targetRotation = new THREE.Quaternion().setFromUnitVectors(
          die.normals[result - 1],
          new THREE.Vector3(0, 1, 0),
        );
        diceAnimations.push({
          die,
          result,
          startPosition: die.mesh.position.clone(),
          targetPosition: target,
          startRotation: die.mesh.quaternion.clone(),
          targetRotation,
          axis,
          turns: 3 + Math.floor(Math.random() * 3),
          throwPower: throwVector.length(),
          startTime: performance.now(),
          duration: 1500 + Math.min(throwVector.length() * 120, 500),
          onComplete,
        });
      };

      const throwYouDie = () => {
        phase = 'you-rolling';
        const result = 1 + Math.floor(Math.random() * 20);
        const throwVector = drag.current.clone().sub(drag.origin);
        const target = youDie.mesh.position.clone().addScaledVector(throwVector, 0.4);
        target.x = THREE.MathUtils.clamp(target.x, -5.5 * boardScaleX, 5.5 * boardScaleX);
        target.z = THREE.MathUtils.clamp(target.z, 0.7, 4.2);
        target.y = D20_REST_Y;
        onStatus('Your d20 is rolling...');
        animateDie(youDie, result, target, throwVector, () => {
          onStatus(`You rolled ${result}. The NPC is rolling...`);
          phase = 'npc-wait';
          setTimeout(() => {
            phase = 'npc-rolling';
            const npcResult = 1 + Math.floor(Math.random() * 20);
            const npcTarget = new THREE.Vector3(
              THREE.MathUtils.randFloat(-4, 4) * boardScaleX,
              D20_REST_Y,
              THREE.MathUtils.randFloat(-4.2, -0.7),
            );
            const npcVector = npcTarget.clone().sub(npcDie.mesh.position);
            animateDie(npcDie, npcResult, npcTarget, npcVector, () => {
              if (result === npcResult) {
                onStatus(`Both rolled ${result}. Tie! Drag your d20 to roll again.`);
                phase = 'tie-reset';
                setTimeout(() => {
                  youDie.mesh.position.set(-1.5 * boardScaleX, D20_REST_Y, 2.4);
                  npcDie.mesh.position.set(1.5 * boardScaleX, D20_REST_Y, -2.4);
                  youDie.mesh.quaternion.identity();
                  npcDie.mesh.quaternion.identity();
                  phase = 'you';
                }, 900);
                return;
              }
              const first = result > npcResult ? 'You' : 'NPC';
              finish({ you: result, npc: npcResult, first });
            });
          }, 650);
        });
      };

      function onPointerDown(event) {
        if (phase !== 'you') return;
        updatePointer(event);
        if (!ray.intersectObject(youDie.mesh, true).length) return;
        const point = projectToTable(event);
        if (!point) return;
        drag = { pointerId: event.pointerId, origin: point, current: point.clone(), screenDistance: 0, x: event.clientX, y: event.clientY };
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = 'grabbing';
        event.preventDefault();
      }

      function onPointerMove(event) {
        if (drag && event.pointerId === drag.pointerId) {
          const point = projectToTable(event);
          if (point) {
            drag.current.copy(point);
            youDie.mesh.position.set(
              THREE.MathUtils.clamp(point.x, -5.5 * boardScaleX, 5.5 * boardScaleX),
              D20_REST_Y,
              THREE.MathUtils.clamp(point.z, 0.7, 4.2),
            );
          }
          drag.screenDistance += Math.hypot(event.clientX - drag.x, event.clientY - drag.y);
          drag.x = event.clientX;
          drag.y = event.clientY;
          return;
        }
        updatePointer(event);
        canvas.style.cursor = phase === 'you' && ray.intersectObject(youDie.mesh, true).length ? 'grab' : 'default';
      }

      function onPointerUp(event) {
        if (!drag || event.pointerId !== drag.pointerId) return;
        if (drag.screenDistance < 24) {
          drag = null;
          canvas.style.cursor = 'grab';
          onStatus('Click and drag your d20 across the table to throw it.');
          return;
        }
        const release = projectToTable(event);
        if (release) drag.current.copy(release);
        throwYouDie();
        drag = null;
      }

      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerUp);
      onStatus('Drag and release your d20 to roll for first turn.');
    });
  }

  // side: +1 = you (bottom of screen), -1 = opponent (top)
  function deal(sideSign, player, { showHand }) {
    const rotation = sideSign < 0 ? Math.PI : 0;
    const positionFor = (key) => {
      const [x, z] = zones[key];
      return new THREE.Vector3(x * sideSign * boardScaleX, MAT_TOP + T / 2, z * sideSign);
    };
    const addCard = (card, position) => {
      const mesh = makeCard(card, true);
      mesh.position.copy(position);
      mesh.rotation.y = rotation;
      mesh.userData.restPosition = mesh.position.clone();
      clickableCards.push(mesh);
      return mesh;
    };

    const h = makeCard({ name: player.hero.name, image: player.hero.image, label: 'Hero' }, true);
    h.position.copy(positionFor('hero'));
    h.rotation.y = rotation;
    h.userData.restPosition = h.position.clone();
    clickableCards.push(h);

    const weaponPositions = [positionFor('weaponLeft'), positionFor('weaponRight')];
    let weaponIndex = 0;
    for (const equipment of player.equipment) {
      const isWeaponSlot = equipment.slot === 'weapon' || equipment.slot === 'other';
      const position = isWeaponSlot
        ? weaponPositions[Math.min(weaponIndex++, weaponPositions.length - 1)]
        : positionFor(equipment.slot);
      addCard({ name: equipment.name, image: equipment.image, label: equipment.slot }, position);
    }

    let remaining = player.library.length + player.hand.length;
    const [deckX, deckZ] = zones.deck;
    const stack = makeDeckStack(deckX * sideSign * boardScaleX, deckZ * sideSign, remaining);

    player.hand.forEach((card, i) => {
      const mesh = makeCard(card, showHand);
      mesh.rotation.y = rotation;
      mesh.position.copy(stack.top());
      const x = (i - (player.hand.length - 1) / 2) * 0.95 * sideSign * boardScaleX;
      mesh.userData.base = MAT_TOP + T / 2 + i * 0.002;
      mesh.userData.restPosition = new THREE.Vector3(x, mesh.userData.base, 4.55 * sideSign);
      moveTo(mesh, new THREE.Vector3(x, mesh.userData.base, 4.55 * sideSign), 650, 400 + i * 220);
      setTimeout(() => stack.set(--remaining), 400 + i * 220);
      if (showHand) {
        yourHand.push(mesh);
        clickableCards.push(mesh);
      }
    });
  }

  function clearInitiativeDice() {
    diceAnimations.length = 0;
    for (const die of diceGroup.children) {
      die.traverse((object) => {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.filter(Boolean).forEach((material) => {
          material.map?.dispose();
          material.dispose();
        });
      });
    }
    diceGroup.clear();
  }

  function reset() {
    group.clear();
    clearInitiativeDice();
    tweens.length = 0;
    clickableCards.length = 0;
    yourHand.length = 0;
    hovered = null;
    preview = null;
    renderer.domElement.style.cursor = 'default';
  }

  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function updatePointer(e) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
  }

  renderer.domElement.addEventListener('pointermove', (e) => {
    if (initiativeActive) return;
    updatePointer(e);
    hovered = preview ? null : ray.intersectObjects(clickableCards, false)[0]?.object ?? null;
    if (preview) {
      const overPreview = ray.intersectObject(preview.mesh, false).length > 0;
      renderer.domElement.style.cursor = overPreview ? 'pointer' : 'default';
      return;
    }
    renderer.domElement.style.cursor = hovered ? 'pointer' : 'default';
  });

  renderer.domElement.addEventListener('click', (e) => {
    if (initiativeActive) return;
    updatePointer(e);
    if (preview) {
      if (ray.intersectObject(preview.mesh, false).length) preview.closing = true;
      return;
    }

    const cardMesh = ray.intersectObjects(clickableCards, false)[0]?.object;
    if (!cardMesh?.userData.card) return;
    preview = {
      mesh: makeCard(cardMesh.userData.card, true),
      sourcePosition: cardMesh.userData.restPosition.clone(),
      sourceRotation: cardMesh.rotation.clone(),
      sourceScale: cardMesh.scale.clone(),
      closing: false,
    };
    preview.mesh.position.copy(cardMesh.position);
    preview.mesh.rotation.copy(cardMesh.rotation);
    preview.mesh.scale.copy(cardMesh.scale);
  });

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i];
      const k = Math.min(Math.max((now - t.start) / t.ms, 0), 1);
      const e = 1 - Math.pow(1 - k, 3);
      t.mesh.position.lerpVectors(t.from, t.to, e);
      t.mesh.position.y += Math.sin(k * Math.PI) * 0.6; // little arc while dealing
      if (k === 1) { t.mesh.userData.settled = true; tweens.splice(i, 1); }
    }
    for (let i = diceAnimations.length - 1; i >= 0; i--) {
      const animation = diceAnimations[i];
      const t = Math.min((now - animation.startTime) / animation.duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      animation.die.mesh.position.lerpVectors(animation.startPosition, animation.targetPosition, eased);
      animation.die.mesh.position.y += Math.sin(t * Math.PI) * (0.85 + animation.throwPower * 0.12);
      const spin = new THREE.Quaternion().setFromAxisAngle(animation.axis, Math.PI * 2 * animation.turns * (1 - eased));
      animation.die.mesh.quaternion.copy(animation.startRotation).slerp(animation.targetRotation, eased).multiply(spin);
      if (t === 1) {
        animation.die.mesh.position.copy(animation.targetPosition);
        animation.die.mesh.quaternion.copy(animation.targetRotation);
        diceAnimations.splice(i, 1);
        animation.onComplete(animation.result);
      }
    }
    for (const m of yourHand) {
      if (!m.userData.settled) continue;
      const target = m.userData.base + (m === hovered ? 0.12 : 0);
      m.position.y += (target - m.position.y) * 0.2;
      m.rotation.x += ((m === hovered ? 0.05 : 0) - m.rotation.x) * 0.2;
    }
    if (preview) {
      const targetPosition = preview.closing ? preview.sourcePosition : PREVIEW_POSITION;
      const targetScale = preview.closing ? preview.sourceScale : PREVIEW_SCALE;
      const targetRotation = preview.closing
        ? preview.sourceRotation
        : PREVIEW_ROTATION.set(0.95 + pointer.y * 0.08, pointer.x * 0.14, -pointer.x * 0.04);
      preview.mesh.position.lerp(targetPosition, 0.16);
      preview.mesh.scale.lerp(targetScale, 0.16);
      preview.mesh.rotation.x = THREE.MathUtils.lerp(preview.mesh.rotation.x, targetRotation.x, 0.16);
      preview.mesh.rotation.y = THREE.MathUtils.lerp(preview.mesh.rotation.y, targetRotation.y, 0.16);
      preview.mesh.rotation.z = THREE.MathUtils.lerp(preview.mesh.rotation.z, targetRotation.z, 0.16);

        if (preview.closing && preview.mesh.position.distanceTo(targetPosition) < 0.02 &&
          preview.mesh.scale.distanceTo(targetScale) < 0.02) {
        group.remove(preview.mesh);
        preview = null;
      }
    }
    renderer.render(scene, camera);
  });

  return { deal, reset, resize, rollInitiative, clearInitiativeDice, setPlaymatOptions };
}
