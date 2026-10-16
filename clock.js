/* The O in BATTO: a procedural Three.js watch head (code only, modelled after REF-front-pose:
   gold case and bezel, midnight sunburst dial with three counters, applied batons, skeleton-style
   hands, knurled crown and two pushers). The hands show the visitor's local time and the seconds
   hand steps eight times a second, like the 28,800 vph movement. Scrolling the section turns the
   head from edge-on to face-on as the letters close in around it. If WebGL or the CDN is missing,
   the plain "O" stays in place. */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const cv = document.getElementById("clockCv");
const slot = cv && cv.parentElement;
const sec = document.getElementById("time");
const letters = [...document.querySelectorAll(".tw-l")];
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

function build(){
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  camera.position.set(0, 0, 5.4);

  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-3, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fb4ff, 1.4); rim.position.set(4, -2, -3); scene.add(rim);

  const gold = new THREE.MeshPhysicalMaterial({ color: 0xd9b45e, metalness: 1, roughness: 0.24, clearcoat: 0.4, clearcoatRoughness: 0.2 });
  const goldBright = gold.clone(); goldBright.roughness = 0.12;
  const goldSatin = gold.clone(); goldSatin.roughness = 0.42;

  const watch = new THREE.Group();
  scene.add(watch);

  // Case: lathe profile around the dial axis (Y), turned to face +Z
  const prof = [[0, -0.2], [0.92, -0.2], [1.02, -0.15], [1.07, -0.04], [1.07, 0.06], [1.03, 0.13], [0.97, 0.16]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const caseMesh = new THREE.Mesh(new THREE.LatheGeometry(prof, 160), goldSatin);
  caseMesh.rotation.x = Math.PI / 2;
  watch.add(caseMesh);

  // Polished bezel ring
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.955, 0.055, 40, 200), goldBright);
  bezel.position.z = 0.165;
  watch.add(bezel);

  // Dial: midnight sunburst, minute track, three counters, wordmark, date window (canvas texture)
  const S = 2048, c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d"), m = S / 2;
  const rad = g.createRadialGradient(m, m, 0, m, m, m);
  rad.addColorStop(0, "#22397a"); rad.addColorStop(0.62, "#14245a"); rad.addColorStop(1, "#060b1f");
  g.fillStyle = rad; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 720; i++){                         // sunburst brushing
    const a = i / 720 * Math.PI * 2;
    g.strokeStyle = i % 2 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.05)";
    g.lineWidth = 2.2; g.beginPath(); g.moveTo(m, m); g.lineTo(m + Math.cos(a) * m, m + Math.sin(a) * m); g.stroke();
  }
  g.strokeStyle = "rgba(236,233,227,0.85)";
  for (let i = 0; i < 300; i++){                         // minute track with fifth-second marks
    const a = i / 300 * Math.PI * 2, big = i % 25 === 0, mid = i % 5 === 0;
    const r1 = m * 0.965, r2 = m * (big ? 0.905 : mid ? 0.925 : 0.945);
    g.lineWidth = big ? 6 : mid ? 3.5 : 1.6;
    g.beginPath(); g.moveTo(m + Math.cos(a) * r1, m + Math.sin(a) * r1); g.lineTo(m + Math.cos(a) * r2, m + Math.sin(a) * r2); g.stroke();
  }
  const counter = (cx, cy, labels) => {
    const r = m * 0.2;
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, "#0f1c49"); rg.addColorStop(1, "#091233");
    g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    for (let k = 1; k < 26; k++){ g.strokeStyle = `rgba(255,255,255,${k % 2 ? 0.05 : 0.02})`; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r * k / 26, 0, Math.PI * 2); g.stroke(); }
    g.strokeStyle = "#d9b45e"; g.lineWidth = 7; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "rgba(236,233,227,0.9)"; g.font = "500 44px Arial"; g.textAlign = "center"; g.textBaseline = "middle";
    labels.forEach((t, k) => { const a = -Math.PI / 2 + k / labels.length * Math.PI * 2; g.fillText(t, cx + Math.cos(a) * r * 0.66, cy + Math.sin(a) * r * 0.66); });
  };
  counter(m - m * 0.42, m, ["60", "20", "40"]);
  counter(m + m * 0.42, m, ["30", "10", "20"]);
  counter(m, m + m * 0.42, ["12", "3", "6", "9"]);
  g.fillStyle = "#ece9e3"; g.font = "600 92px Georgia"; g.textAlign = "center"; g.fillText("BATTO", m, m - m * 0.4);
  g.fillStyle = "#f4f1ea"; g.fillRect(m + m * 0.5, m + m * 0.36, 70, 56);
  g.fillStyle = "#111"; g.font = "600 40px Arial"; g.fillText(String(new Date().getDate()), m + m * 0.5 + 35, m + m * 0.36 + 30);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.91, 160),
    new THREE.MeshPhysicalMaterial({ map: tex, metalness: 0.35, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.15 }));
  dial.position.z = 0.15;
  watch.add(dial);

  // Applied batons (skip 3, 6, 9 where the counters sit), double baton at twelve
  const baton = new THREE.BoxGeometry(0.034, 0.13, 0.028);
  for (let i = 0; i < 12; i++){
    if (i === 3 || i === 6 || i === 9) continue;
    const a = i / 12 * Math.PI * 2;
    const offs = i === 0 ? [-0.028, 0.028] : [0];
    offs.forEach(o => {
      const b = new THREE.Mesh(baton, goldBright);
      const r = 0.74;
      b.position.set(Math.sin(a) * r + Math.cos(a) * o, Math.cos(a) * r - Math.sin(a) * o, 0.168);
      b.rotation.z = -a;
      watch.add(b);
    });
  }

  // Hands: pivot groups so rotation.z is the time
  const hand = (len, w, z, mat, tail = 0) => {
    const grp = new THREE.Group(); grp.position.z = z;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, -tail); shape.lineTo(w / 2, -tail); shape.lineTo(w * 0.36, len * 0.92); shape.lineTo(0, len); shape.lineTo(-w * 0.36, len * 0.92); shape.closePath();
    if (w > 0.03){ const h = new THREE.Path(); h.moveTo(-w * 0.18, len * 0.22); h.lineTo(w * 0.18, len * 0.22); h.lineTo(w * 0.12, len * 0.8); h.lineTo(-w * 0.12, len * 0.8); h.closePath(); shape.holes.push(h); }
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false }), mat);
    grp.add(mesh); watch.add(grp); return grp;
  };
  const hH = hand(0.46, 0.07, 0.18, goldBright);
  const mH = hand(0.7, 0.055, 0.195, goldBright);
  const sH = hand(0.8, 0.012, 0.21, gold, 0.18);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 32), goldBright);
  cap.rotation.x = Math.PI / 2; cap.position.z = 0.225; watch.add(cap);

  // Crystal: a faint glossy dome catching the environment
  const crystal = new THREE.Mesh(new THREE.CircleGeometry(0.93, 128),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.02, metalness: 0, clearcoat: 1 }));
  crystal.position.z = 0.235;
  watch.add(crystal);

  // Crown (knurled: alternating radii) and two pushers at two and four o'clock
  const crownGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.17, 48, 1);
  const pos = crownGeo.attributes.position;
  for (let i = 0; i < pos.count; i++){
    const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z);
    if (r > 0.1){ const a = Math.atan2(z, x), k = (Math.round(a / (Math.PI * 2) * 48) % 2) ? 0.9 : 1; pos.setX(i, Math.cos(a) * 0.12 * k); pos.setZ(i, Math.sin(a) * 0.12 * k); }
  }
  crownGeo.computeVertexNormals();
  const crown = new THREE.Mesh(crownGeo, goldBright);
  crown.rotation.z = Math.PI / 2; crown.position.set(1.15, 0, -0.02); watch.add(crown);
  [0.5, -0.5].forEach(t => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.2, 32), goldBright);
    p.rotation.z = Math.PI / 2 - t * 0.9;
    p.position.set(Math.cos(t * 0.9) * 1.13, Math.sin(t * 0.9) * 1.13, -0.02);
    watch.add(p);
  });

  return { renderer, scene, camera, watch, hH, mH, sH };
}

let W;
try { W = build(); slot.classList.add("ready"); } catch (e) { W = null; }

if (W){
  const fit = () => {
    const s = slot.getBoundingClientRect();
    W.renderer.setSize(s.width, s.height, false);
    W.camera.aspect = s.width / Math.max(1, s.height); W.camera.updateProjectionMatrix();
  };
  new ResizeObserver(fit).observe(slot); fit();

  let visible = false, shown = 0, last = 0;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) requestAnimationFrame(loop); }, { rootMargin: "100px" }).observe(sec);

  const sm = t => t * t * (3 - 2 * t), clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  function loop(now){
    if (!visible) return;
    const dt = last ? Math.min(100, now - last) : 16.7; last = now;
    const r = sec.getBoundingClientRect();
    const p = clamp(-r.top / Math.max(1, r.height - innerHeight), 0, 1);
    shown = reduce ? p : shown + (p - shown) * (1 - Math.pow(1 - 0.115, dt / 16.667));
    const e = sm(clamp(shown / 0.62, 0, 1));                       // edge-on -> face-on
    W.watch.rotation.y = reduce ? 0 : (1 - e) * -1.32;
    W.watch.rotation.x = reduce ? 0 : (1 - e) * 0.42;
    W.watch.rotation.z = reduce ? 0 : (1 - e) * -0.18;
    letters.forEach((l, i) => {                                     // the letters close in on the O
      const k = reduce ? 1 : sm(clamp((shown - 0.12 - i * 0.05) / 0.4, 0, 1));
      l.style.transform = `translate3d(${((1 - k) * (i - 4.2) * 9).toFixed(2)}vw,0,0)`;
      l.style.opacity = (0.15 + 0.85 * k).toFixed(3);
    });
    const d = new Date(), s = d.getSeconds() + Math.floor(d.getMilliseconds() / 125) / 8;
    const mnt = d.getMinutes() + s / 60, hr = (d.getHours() % 12) + mnt / 60;
    W.sH.rotation.z = -s / 60 * Math.PI * 2;
    W.mH.rotation.z = -mnt / 60 * Math.PI * 2;
    W.hH.rotation.z = -hr / 12 * Math.PI * 2;
    W.renderer.render(W.scene, W.camera);
    requestAnimationFrame(loop);
  }
  window.__clock = { get rotY(){ return W.watch.rotation.y; }, ready: true };
}
