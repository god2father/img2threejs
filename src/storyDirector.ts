import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type * as THREE from 'three';

gsap.registerPlugin(ScrollTrigger);

export type StoryState = {
  warm: number;
  music: number;
  figureOpacity: number;
  roomOpen: number;
  connection: number;
  depth: number;
};

type StoryDirectorOptions = {
  camera: THREE.PerspectiveCamera;
  target: THREE.Vector3;
  model: THREE.Group;
  figure: THREE.Group;
  assembledCamera: THREE.Vector3;
  assembledTarget: THREE.Vector3;
  reviewMode: boolean;
  setPower: (powered: boolean) => void;
  setExploring: (exploring: boolean) => void;
};

type Chapter = { id: string; threshold: number; status: string };
type Shot = { id: string; threshold: number; label: string };

const chapters: Chapter[] = [
  { id: 'prologue', threshold: 0, status: '18:47 · END OF DAY' },
  { id: 'home', threshold: 0.13, status: '19:26 · DOOR CLOSED' },
  { id: 'sit', threshold: 0.27, status: '19:31 · DROP THE WEIGHT' },
  { id: 'connect', threshold: 0.43, status: '19:33 · PAIRING NOIR S1' },
  { id: 'play', threshold: 0.56, status: '19:34 · PRESS PLAY' },
  { id: 'release', threshold: 0.7, status: 'LET THE ROOM BREATHE' },
];

const shots: Shot[] = [
  { id: 'city', threshold: 0, label: 'CITY / LAST LIGHT' },
  { id: 'threshold', threshold: 0.12, label: 'INT. HALLWAY / FOLLOW' },
  { id: 'room', threshold: 0.24, label: 'LIVING ROOM / WIDE' },
  { id: 'sofa', threshold: 0.34, label: 'SOFA / PROFILE' },
  { id: 'phone', threshold: 0.43, label: 'OVER SHOULDER / POV' },
  { id: 'control', threshold: 0.52, label: 'CONTROL DECK / MACRO' },
  { id: 'grille', threshold: 0.58, label: 'FIRST BEAT / CLOSE' },
  { id: 'pulse', threshold: 0.65, label: 'LOW FREQUENCY / DOLLY' },
  { id: 'wide-release', threshold: 0.71, label: 'THE ROOM / WIDE' },
  { id: 'orbit', threshold: 0.79, label: 'NOIR S1 / ORBIT' },
  { id: 'hero', threshold: 0.87, label: 'PRODUCT / HERO' },
];

function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Story element was not found: ${selector}`);
  return found;
}

export function setupStoryDirector(options: StoryDirectorOptions): StoryState {
  const story = element<HTMLElement>('#story');
  const explore = element<HTMLElement>('#explore');
  const phone = element<HTMLElement>('#phone');
  const deviceButton = element<HTMLButtonElement>('#phone-device');
  const playButton = element<HTMLButtonElement>('#story-play-button');
  const deviceStatus = element<HTMLElement>('#device-status');
  const sceneStatus = element<HTMLElement>('#scene-status');
  const shotLabel = element<HTMLElement>('#shot-label');
  const shotNumber = element<HTMLElement>('#shot-number');
  const shotTransition = element<HTMLElement>('.shot-transition');
  const focusPlane = element<HTMLElement>('.focus-plane');
  const foregroundShoulder = element<HTMLElement>('.foreground-shoulder');
  const chapterItems = Array.from(document.querySelectorAll<HTMLElement>('[data-chapter]'));
  const copies = Object.fromEntries(chapters.map(({ id }) => [id, element<HTMLElement>(`[data-copy="${id}"]`)]));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state: StoryState = {
    warm: reducedMotion || options.reviewMode ? 1 : 0,
    music: reducedMotion || options.reviewMode ? 0.38 : 0,
    figureOpacity: reducedMotion || options.reviewMode ? 0.18 : 0,
    roomOpen: reducedMotion || options.reviewMode ? 1 : 0,
    connection: reducedMotion || options.reviewMode ? 1 : 0,
    depth: reducedMotion || options.reviewMode ? 0 : 1,
  };
  let connected = state.connection > 0.72;
  let activeChapter = '';
  let activeShot = '';

  function setConnectionUi(nextConnected: boolean): void {
    connected = nextConnected;
    phone.classList.toggle('is-connected', nextConnected);
    deviceButton.setAttribute('aria-pressed', String(nextConnected));
    deviceButton.setAttribute('aria-label', nextConnected ? 'NOIR S1 已连接' : '连接 NOIR S1 音响');
    deviceStatus.textContent = nextConnected ? 'CONNECTED' : 'SEARCHING…';
    if (activeChapter === 'connect') sceneStatus.textContent = nextConnected ? '19:33 · NOIR S1 CONNECTED' : '19:33 · PAIRING NOIR S1';
    options.setPower(nextConnected);
  }

  function setActiveChapter(progress: number): void {
    const chapter = [...chapters].reverse().find((item) => progress >= item.threshold) ?? chapters[0];
    if (chapter.id === activeChapter) return;
    activeChapter = chapter.id;
    chapterItems.forEach((item) => item.classList.toggle('is-active', item.dataset.chapter === chapter.id));
    sceneStatus.textContent = chapter.status;
  }

  function setActiveShot(progress: number): void {
    let shotIndex = 0;
    for (let index = 1; index < shots.length; index += 1) {
      if (progress < shots[index].threshold) break;
      shotIndex = index;
    }
    const shot = shots[shotIndex];
    if (shot.id === activeShot) return;
    activeShot = shot.id;
    document.body.dataset.shot = shot.id;
    shotLabel.textContent = shot.label;
    shotNumber.textContent = `SHOT ${String(shotIndex + 1).padStart(2, '0')}`;
  }

  function setExploreMode(exploring: boolean): void {
    document.body.classList.toggle('is-exploring', exploring);
    explore.setAttribute('aria-hidden', String(!exploring));
    explore.inert = !exploring;
    options.setExploring(exploring);
  }

  function scrollToProgress(progress: number): void {
    const available = Math.max(0, story.offsetHeight - window.innerHeight);
    window.scrollTo({ top: story.offsetTop + available * progress, behavior: reducedMotion ? 'auto' : 'smooth' });
  }

  deviceButton.addEventListener('click', () => scrollToProgress(0.52));
  playButton.addEventListener('click', () => scrollToProgress(0.62));

  if (options.reviewMode) {
    document.documentElement.classList.add('review-mode');
    setConnectionUi(true);
    setExploreMode(true);
    return state;
  }

  setExploreMode(false);
  const exploreTrigger = ScrollTrigger.create({
    trigger: explore,
    start: 'top 2%',
    end: 'bottom top',
    onEnter: () => setExploreMode(true),
    onEnterBack: () => setExploreMode(true),
    onLeaveBack: () => setExploreMode(false),
  });

  if (reducedMotion) {
    document.documentElement.classList.add('reduced-motion');
    setConnectionUi(true);
    setActiveChapter(1);
    setActiveShot(1);
    options.camera.position.copy(options.assembledCamera);
    options.camera.fov = 28;
    options.target.copy(options.assembledTarget);
    options.model.position.set(0, 0, 0);
    options.model.rotation.y = 0.1;
    options.model.scale.setScalar(1);
    requestAnimationFrame(() => exploreTrigger.refresh());
    return state;
  }

  gsap.set(Object.values(copies), { autoAlpha: 0, y: 20 });
  gsap.set(copies.prologue, { autoAlpha: 1, y: 0 });
  gsap.set(phone, { autoAlpha: 0, y: 80, rotateX: 10, rotateZ: 2, scale: 0.92 });
  gsap.set([shotTransition, focusPlane, foregroundShoulder], { autoAlpha: 0 });

  const media = gsap.matchMedia();
  media.add({ desktop: '(min-width: 701px)', compact: '(max-width: 700px)' }, (context) => {
    const compact = context.conditions?.compact ?? false;
    options.camera.position.set(compact ? -1.4 : -2.6, 3.4, compact ? 17.5 : 15.2);
    options.camera.fov = compact ? 38 : 34;
    options.target.set(-6.4, 2.25, -5.45);
    options.model.position.set(compact ? 3.8 : 4.6, -0.05, -0.2);
    options.model.rotation.y = 0.22;
    options.model.scale.setScalar(0.94);
    options.figure.position.x = -2.2;
    options.figure.rotation.z = 0.08;

    const timeline = gsap.timeline({
      defaults: { ease: 'power2.inOut' },
      scrollTrigger: {
        trigger: story,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.42,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          setActiveChapter(self.progress);
          setActiveShot(self.progress);
          const shouldConnect = state.connection > 0.72;
          if (shouldConnect !== connected) setConnectionUi(shouldConnect);
          document.body.classList.toggle('is-playing', state.music > 0.16);
        },
      },
    });

    const cutTo = (
      at: number,
      cameraPosition: { x: number; y: number; z: number },
      targetPosition: { x: number; y: number; z: number },
      fov: number,
      darkness = 0.92,
    ): void => {
      timeline
        .to(shotTransition, { autoAlpha: darkness, duration: 0.075, ease: 'power4.in' }, at)
        .to(options.camera.position, { ...cameraPosition, duration: 0.14, ease: 'power4.inOut' }, at + 0.035)
        .to(options.target, { ...targetPosition, duration: 0.14, ease: 'power4.inOut' }, at + 0.035)
        .to(options.camera, { fov, duration: 0.14, ease: 'power4.inOut' }, at + 0.035)
        .to(shotTransition, { autoAlpha: 0, duration: 0.18, ease: 'power3.out' }, at + 0.115);
    };

    timeline
      .addLabel('city', 0)
      .to('.city-glow', { opacity: 0.86, duration: 1.05 }, 0)
      .to(options.camera.position, { x: compact ? -2.2 : -3.7, y: 3.1, z: compact ? 15.6 : 13.4, duration: 1.25, ease: 'sine.inOut' }, 0)
      .to(options.target, { x: -6.8, y: 2.05, z: -5.35, duration: 1.25, ease: 'sine.inOut' }, 0)
      .to(options.camera, { fov: compact ? 35 : 31, duration: 1.25 }, 0)
      .to('.scroll-cue', { autoAlpha: 0, duration: 0.3 }, 0.8)
      .to(copies.prologue, { autoAlpha: 0, y: -16, duration: 0.3 }, 1.2)

      .addLabel('threshold', 1.43)
      .to(copies.home, { autoAlpha: 1, y: 0, duration: 0.38 }, 1.52)
      .to('.door-shadow', { xPercent: 122, duration: 1.12, ease: 'power3.inOut' }, 1.44)
      .to(options.camera.position, { x: compact ? 5.1 : 6.8, y: 3.15, z: compact ? 19.2 : 17.2, duration: 1.22, ease: 'sine.out' }, 1.55)
      .to(options.target, { x: 1.4, y: 0.1, z: -0.35, duration: 1.22 }, 1.55)
      .to(options.model.position, { x: compact ? 1.7 : 2.5, y: 0, z: 0, duration: 1.18 }, 1.5)
      .to(state, { warm: 0.26, roomOpen: 0.22, depth: 0.82, duration: 1.15 }, 1.48)

      .addLabel('room-wide', 2.82)
      .to(options.camera.position, { x: compact ? 6.2 : 8.1, y: 2.5, z: compact ? 21.5 : 20.3, duration: 1.2, ease: 'sine.inOut' }, 2.9)
      .to(options.target, { x: -0.8, y: -0.38, z: -1.15, duration: 1.2 }, 2.9)
      .to(options.camera, { fov: compact ? 42 : 38, duration: 1.2 }, 2.9)
      .to(options.model.position, { x: compact ? 2.1 : 2.8, duration: 1.2 }, 2.9)
      .to(options.figure.position, { x: 0, duration: 1.2, ease: 'power2.out' }, 2.9)
      .to(options.figure.rotation, { z: 0, duration: 1.2 }, 2.9)
      .to(state, { warm: 0.4, figureOpacity: 0.42, roomOpen: 0.38, duration: 1.2 }, 2.9)
      .to(copies.home, { autoAlpha: 0, y: -14, duration: 0.3 }, 3.08)
      .to(copies.sit, { autoAlpha: 1, y: 0, duration: 0.36 }, 3.25)

      .addLabel('sit', 3.28)
      .to(options.camera.position, { x: compact ? 4.6 : 6.5, y: 1.85, z: compact ? 19.6 : 17.8, duration: 1.05, ease: 'sine.inOut' }, 3.3)
      .to(options.target, { x: -1.65, y: -0.4, z: -1.35, duration: 1.05 }, 3.3)
      .to(options.camera, { fov: compact ? 38 : 34, duration: 1.05 }, 3.3)
      .to(state, { figureOpacity: 0.92, warm: 0.48, duration: 0.9 }, 3.35)

      .addLabel('sofa-profile', 4.18)
      .to(copies.sit, { autoAlpha: 0, y: -14, duration: 0.26 }, 4.25)
      .to(options.camera.position, { x: compact ? 1.5 : -0.6, y: 1.55, z: compact ? 17.5 : 15.8, duration: 0.78, ease: 'sine.inOut' }, 4.25)
      .to(options.target, { x: -3.25, y: -0.2, z: -1.75, duration: 0.78 }, 4.25)
      .to(options.camera, { fov: compact ? 34 : 29, duration: 0.78 }, 4.25)
      .to(state, { depth: 0.58, duration: 0.72 }, 4.25)

      .addLabel('phone-pov', 4.85)
      .to(copies.connect, { autoAlpha: 1, y: 0, duration: 0.34 }, 4.98)
      .to(foregroundShoulder, { autoAlpha: compact ? 0.5 : 0.78, xPercent: 8, duration: 0.5 }, 4.88)
      .to(phone, { autoAlpha: 1, y: 0, rotateX: 0, rotateZ: compact ? -1 : -2.5, scale: 1, duration: 0.5, ease: 'power3.out' }, 5.02)
      .to(options.camera.position, { x: compact ? 5.1 : 7.2, y: 3.1, z: compact ? 19.2 : 17.1, duration: 0.9 }, 4.92)
      .to(options.target, { x: 1.2, y: 0.62, z: 0, duration: 0.9 }, 4.92)
      .to(options.camera, { fov: compact ? 34 : 30, duration: 0.9 }, 4.92)
      .to(options.model.position, { x: compact ? 1.1 : 1.55, duration: 0.9 }, 4.92)
      .to(state, { warm: 0.56, depth: 0.72, duration: 0.82 }, 4.94)
      .to(state, { connection: 1, duration: 0.62 }, 5.58)

      .addLabel('control-macro', 6.12)
      .to(focusPlane, { autoAlpha: 0.82, duration: 0.08 }, 6.1)
      .to(focusPlane, { autoAlpha: 0, duration: 0.24 }, 6.2)
      .to(options.camera.position, { x: compact ? 2.9 : 3.25, y: compact ? 4.6 : 5.05, z: compact ? 10.5 : 8.1, duration: 0.48, ease: 'power3.out' }, 6.16)
      .to(options.target, { x: 0.3, y: 1.7, z: 0.18, duration: 0.48 }, 6.16)
      .to(options.camera, { fov: compact ? 25 : 20, duration: 0.48 }, 6.16)
      .to(options.model.position, { x: compact ? 0.3 : 0.15, duration: 0.48 }, 6.16)
      .to(foregroundShoulder, { autoAlpha: 0, duration: 0.3 }, 6.14)
      .to(phone, { x: compact ? 0 : -38, scale: 0.95, duration: 0.4 }, 6.18)
      .to(copies.connect, { autoAlpha: 0, y: -12, duration: 0.25 }, 6.34)

      .addLabel('first-beat', 6.68)
      .to(copies.play, { autoAlpha: 1, y: 0, duration: 0.28 }, 6.72)
      .to(phone, { autoAlpha: 0, y: 44, duration: 0.3 }, 6.72)
      .to(state, { music: 1, warm: 0.74, roomOpen: 0.65, depth: 0.46, duration: 0.65 }, 6.88)

      .addLabel('bass-dolly', 7.55)
      .to(options.camera.position, { x: compact ? 2.2 : 2.9, y: 1.75, z: compact ? 15.2 : 12.2, duration: 0.92, ease: 'sine.inOut' }, 7.58)
      .to(options.target, { x: 0, y: 0, z: 0.25, duration: 0.92 }, 7.58)
      .to(options.camera, { fov: compact ? 31 : 27, duration: 0.92 }, 7.58)
      .to(options.model.position, { x: 0, duration: 0.72 }, 7.58)
      .to(copies.play, { autoAlpha: 0, y: -12, duration: 0.28 }, 8.02)

      .addLabel('room-release', 8.34)
      .to(state, { warm: 1, music: 0.62, figureOpacity: 0.34, roomOpen: 1, depth: 0.18, duration: 1.25 }, 8.38)
      .to(copies.release, { autoAlpha: 1, y: 0, duration: 0.42 }, 8.62)
      .to(options.camera.position, { x: compact ? 5.5 : 7.4, y: 4.1, z: compact ? 22.5 : 19.4, duration: 1.55, ease: 'sine.inOut' }, 8.48)
      .to(options.target, { x: -0.2, y: 0.1, z: -0.5, duration: 1.55 }, 8.48)
      .to(options.camera, { fov: compact ? 39 : 36, duration: 1.25 }, 8.48)
      .to(options.model.position, { x: compact ? 1.1 : 1.8, duration: 1.15 }, 8.45)
      .to(options.model.rotation, { y: 0.28, duration: 1.15 }, 8.45)

      .addLabel('hero', 10.18)
      .to(options.camera.position, {
        x: compact ? 4.4 : options.assembledCamera.x,
        y: compact ? 3.35 : options.assembledCamera.y,
        z: compact ? 19.2 : options.assembledCamera.z,
        duration: 0.7,
        ease: 'power3.out',
      }, 10.28)
      .to(options.target, { x: options.assembledTarget.x, y: options.assembledTarget.y, z: options.assembledTarget.z, duration: 0.7 }, 10.28)
      .to(options.camera, { fov: 28, duration: 0.7 }, 10.28)
      .to(options.model.position, { x: 0, y: 0, z: 0, duration: 0.7 }, 10.28)
      .to(options.model.rotation, { y: 0.1, duration: 0.7 }, 10.28)
      .to(state, { music: 0.38, figureOpacity: 0.1, depth: 0, duration: 0.8 }, 10.28)
      .to(state, { music: 0.34, duration: 1.25, ease: 'none' }, 11.05)
      .addLabel('end', 12.3);

    cutTo(
      1.36,
      { x: compact ? 6.8 : 8.9, y: 4.15, z: compact ? 22 : 20.8 },
      { x: 2.4, y: 0.35, z: -0.4 },
      compact ? 39 : 35,
    );
    cutTo(
      4.78,
      { x: compact ? 6.2 : 8.2, y: 3.4, z: compact ? 21.5 : 18.7 },
      { x: 1.6, y: 0.65, z: 0 },
      compact ? 37 : 31,
      0.72,
    );
    cutTo(
      6.62,
      { x: compact ? 0.8 : 0.45, y: 0.45, z: compact ? 12 : 9.1 },
      { x: 0, y: 0, z: 0.55 },
      compact ? 28 : 23,
      0.78,
    );
    cutTo(
      8.28,
      { x: compact ? -5.8 : -8.2, y: 3.7, z: compact ? 23.5 : 20.8 },
      { x: -0.4, y: 0, z: -1 },
      compact ? 42 : 38,
      0.66,
    );
    cutTo(
      10.12,
      { x: compact ? 4.8 : 6.5, y: compact ? 3.5 : 4, z: compact ? 20.4 : 18.2 },
      { x: 0, y: 0.2, z: 0 },
      29,
      0.82,
    );

    return () => {
      timeline.scrollTrigger?.kill();
      timeline.kill();
    };
  });

  window.addEventListener('pagehide', () => {
    media.revert();
    exploreTrigger.kill();
  }, { once: true });

  setActiveChapter(0);
  setActiveShot(0);
  return state;
}
