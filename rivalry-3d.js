import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const models = {
  tactician: '/assets/characters/rival-suit.gltf',
  analyst: '/assets/characters/rival-hoodie.gltf',
  enforcer: '/assets/characters/rival-swat.gltf',
  maverick: '/assets/characters/rival-punk.gltf',
  legend: '/assets/characters/rival-king.gltf',
  maestro: '/assets/characters/rival-adventurer.gltf',
  academy: '/assets/characters/rival-farmer.gltf'
};

const loader = new GLTFLoader();
const mounts = new Map();

function clip(model, name) {
  return THREE.AnimationClip.findByName(model.animations, name);
}

function mountCharacter(host) {
  if (host.dataset.rivalMounted || mounts.has(host)) return;
  host.dataset.rivalMounted = 'true';
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); }
  catch (_) { host.dataset.rivalMounted = ''; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(host.clientWidth || 210, host.clientHeight || 242, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  host.appendChild(renderer.domElement);
  const mount = { renderer, frame: 0, timer: 0, resize: null };
  mounts.set(host, mount);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
  camera.position.set(0, 1.3, 6.3);
  camera.lookAt(0, 1.15, 0);
  const key = new THREE.DirectionalLight(0xffe7b5, 3.2);
  key.position.set(3.5, 5, 5);
  scene.add(key, new THREE.HemisphereLight(0xa8e4ff, 0x173124, 2.2));
  const rim = new THREE.DirectionalLight(0xffc955, 2);
  rim.position.set(-4, 2, -3);
  scene.add(rim);

  loader.load(models[host.dataset.character] || models.tactician, gltf => {
    if (!mounts.has(host)) { renderer.dispose(); return; }
    const character = gltf.scene;
    const outcome = host.dataset.outcome || 'idle';
    const preview = host.classList.contains('manager-3d-preview');
    character.scale.setScalar(preview ? 2.05 : 1.7);
    character.position.y = preview ? -2.02 : -1.75;
    character.rotation.y = host.dataset.side === 'left' ? .33 : host.dataset.side === 'right' ? -.33 : -.1;
    if (outcome === 'lost') { character.rotation.z = -.12; character.position.x = -.12; }
    character.traverse(node => {
      if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
    });
    scene.add(character);
    const mixer = new THREE.AnimationMixer(character);
    const idle = clip(gltf, 'Idle') || clip(gltf, 'Idle_Neutral');
    const gestureName = outcome === 'winner' ? 'Wave' : outcome === 'lost' ? 'HitRecieve_2' : host.dataset.side === 'left' ? 'Wave' : 'Punch_Right';
    const taunt = clip(gltf, gestureName) || clip(gltf, 'Wave');
    if (idle) { const action = mixer.clipAction(idle); action.play(); }
    if (taunt) {
      const action = mixer.clipAction(taunt);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      mount.timer = setInterval(() => { action.reset().fadeIn(.18).play(); }, outcome === 'winner' ? 3600 : outcome === 'lost' ? 5200 : host.dataset.side === 'left' ? 4300 : 5100);
    }
    host.closest('.rivalry-manager, .manager-avatar, .manager-character-choice, .eval-rival-figure, .eval-card-art')?.classList.add('rivalry-3d-ready');
    const clock = new THREE.Clock();
    const animate = () => {
      if (!host.isConnected || !mounts.has(host)) return;
      mount.frame = requestAnimationFrame(animate);
      mixer.update(clock.getDelta());
      character.position.y = (preview ? -2.02 : -1.75) + Math.sin(performance.now() * .0018) * .025;
      renderer.render(scene, camera);
    };
    animate();
  }, undefined, () => dispose(host));

  mount.resize = new ResizeObserver(() => {
    const width = host.clientWidth || 210, height = host.clientHeight || 242;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  mount.resize.observe(host);
}

function dispose(scope = document) {
  const hosts = [];
  if (scope.matches?.('.rivalry-3d, .manager-3d-preview')) hosts.push(scope);
  hosts.push(...scope.querySelectorAll?.('.rivalry-3d, .manager-3d-preview') || []);
  hosts.forEach(host => {
    const mount = mounts.get(host);
    if (!mount) return;
    cancelAnimationFrame(mount.frame);
    clearInterval(mount.timer);
    mount.resize?.disconnect();
    mount.renderer.dispose();
    mount.renderer.domElement.remove();
    mounts.delete(host);
    host.dataset.rivalMounted = '';
  });
}

function scan() {
  document.querySelectorAll('.rivalry-3d[data-character], .manager-3d-preview[data-character]').forEach(mountCharacter);
}

new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
window.rivalry3D = { scan, dispose };
scan();
