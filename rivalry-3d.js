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
THREE.Cache.enabled = true;

function clip(model, name) {
  return THREE.AnimationClip.findByName(model.animations, name);
}

function mountCharacter(host) {
  if (host.dataset.rivalMounted || mounts.has(host)) return;
  host.dataset.rivalMounted = 'true';
  let renderer;
  const cinematic = host.closest('.versus-cinematic');
  try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: Boolean(cinematic) }); }
  catch (_) { host.dataset.rivalMounted = ''; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cinematic ? 1.5 : 1));
  renderer.setSize(host.clientWidth || 210, host.clientHeight || 242, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  host.appendChild(renderer.domElement);
  const mount = { renderer, frame: 0, timer: 0, resize: null, intersection: null, visible: true, lastRender: 0 };
  mounts.set(host, mount);
  if ('IntersectionObserver' in window) {
    mount.intersection = new IntersectionObserver(entries => { mount.visible = Boolean(entries[0]?.isIntersecting); }, { threshold: .01 });
    mount.intersection.observe(host);
  }

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
    const view = host.dataset.view || (host.classList.contains('manager-3d-preview') ? 'manager-card' : 'rivalry');
    const framing = view === 'evaluation-card'
      ? { scale: 2.18, y: -2.04 }
      : view === 'manager-card'
        ? { scale: 2.3, y: -2.18 }
        : { scale: 1.7, y: -1.75 };
    character.scale.setScalar(framing.scale);
    character.position.y = framing.y;
    character.rotation.y = host.dataset.side === 'left' ? .33 : host.dataset.side === 'right' ? -.33 : -.1;
    if (outcome === 'lost') { character.rotation.z = -.12; character.position.x = -.12; }
    character.traverse(node => { if (node.isMesh) { node.castShadow = false; node.receiveShadow = false; } });
    scene.add(character);
    const poseNodes = ['Head', 'Chest', 'UpperArm.L', 'UpperArm.R', 'LowerArm.L', 'LowerArm.R']
      .map(name => character.getObjectByName(name))
      .filter(Boolean);
    const restPose = new Map(poseNodes.map(node => [node, node.rotation.clone()]));
    const setPose = (name, x = 0, y = 0, z = 0) => {
      const node = character.getObjectByName(name), rest = restPose.get(node);
      if (node && rest) node.rotation.set(rest.x + x, rest.y + y, rest.z + z);
    };
    const mixer = new THREE.AnimationMixer(character);
    const clipEmotes = {
      wave: ['Wave'],
      punch: ['Punch_Right', 'Punch_Left'],
      kick: ['Kick_Right', 'Kick_Left'],
      walk: ['Walk']
    };
    let activeGesture = null, activeAction = null;
    const syncClipEmote = motion => {
      if (motion === activeGesture) return;
      activeGesture = motion;
      if (activeAction) { mixer.stopAllAction(); mixer.update(0); activeAction = null; }
      restPose.forEach((rotation, node) => node.rotation.copy(rotation));
      const animation = (clipEmotes[motion] || []).map(name => clip(gltf, name)).find(Boolean);
      if (!animation) return;
      activeAction = mixer.clipAction(animation);
      if (motion === 'punch') activeAction.setDuration(2.5);
      activeAction.reset().setLoop(motion === 'walk' ? THREE.LoopRepeat : THREE.LoopOnce, motion === 'walk' ? Infinity : 1);
      activeAction.clampWhenFinished = motion === 'walk';
      activeAction.play();
    };
    host.closest('.rivalry-manager, .manager-avatar, .manager-character-choice, .eval-rival-figure, .eval-card-art')?.classList.add('rivalry-3d-ready');
    const clock = new THREE.Clock();
    const animate = now => {
      if (!host.isConnected || !mounts.has(host)) return;
      mount.frame = requestAnimationFrame(animate);
      if (document.hidden || !mount.visible || host.clientWidth < 2 || host.clientHeight < 2) return;
      const frameInterval = cinematic ? 1000 / 45 : 1000 / 30;
      if (now - mount.lastRender < frameInterval) return;
      mount.lastRender = now;
      const beat = performance.now() * .001;
      const motion = host.dataset.gesture || (outcome === 'winner' ? 'celebrate' : outcome === 'lost' ? 'slump' : 'neutral');
      syncClipEmote(motion);
      if (activeAction) {
        mixer.update(Math.min(clock.getDelta(), .05));
        character.position.y = framing.y;
        character.rotation.x = 0;
        character.rotation.z = 0;
      } else if (motion === 'celebrate' || motion === 'fist_pump') {
        const jump = Math.max(0, Math.sin(beat * 4.2)) * .28;
        character.position.y = framing.y + (motion === 'celebrate' ? jump : .02);
        character.rotation.x = 0;
        character.rotation.z = Math.sin(beat * 4.2) * .045;
        setPose('UpperArm.R', 0, 0, -.95 + Math.sin(beat * 8.4) * .22);
        setPose('LowerArm.R', 0, 0, .45);
        setPose('UpperArm.L', 0, 0, motion === 'celebrate' ? .75 : .18);
        setPose('Head', 0, Math.sin(beat * 2.1) * .12, 0);
      } else if (motion === 'slump') {
        // A forward root-level slouch is visible and safe for every rig variant.
        character.position.y = framing.y - .13 + Math.sin(beat * 1.2) * .006;
        character.rotation.x = .24;
        character.rotation.z = -.045;
      } else if (motion === 'hit_react') {
        const flinch = Math.max(0, Math.sin(beat * 5.2));
        character.position.y = framing.y + flinch * .055;
        character.rotation.x = -.12 * flinch;
        character.rotation.z = -.11 * flinch;
      } else if (motion === 'taunt') {
        const taunt = Math.sin(beat * 3.5);
        character.position.y = framing.y + Math.abs(taunt) * .045;
        character.rotation.x = 0;
        character.rotation.z = taunt * .035;
        setPose('Head', 0, taunt * .22, 0);
        setPose('Chest', 0, 0, -taunt * .05);
        setPose('UpperArm.R', 0, 0, -.38 + taunt * .13);
      } else {
        character.position.y = framing.y + Math.sin(beat * 1.6) * .012;
        character.rotation.x = 0;
        character.rotation.z = 0;
      }
      renderer.render(scene, camera);
    };
    animate(performance.now());
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
    mount.intersection?.disconnect();
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
