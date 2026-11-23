// 3D Cosmic Web Embedded Galaxies & Clusters overlay (Approach 2):
// Renders the 313 hosted 5-level (400 kpc -> 12 pc / 4 Mpc -> 15 kpc) galaxies and massive clusters
// at their exact 3D cosmological coordinates inside the 6 whole-box IGM simulations of igm.tanmaysingh.uk.
// Clicking any 3D halo marker smoothly centers the 3D orbit pivot on [x, y, z] and opens a frosted
// liquid-glass HUD card with:
//   1. "Zoom 3D Halo (400 kpc → 12 pc)" — loads that halo's 5-level manifest_v2.json in place inside the 3D viewer
//      (with a "← Back to Cosmic Web Box" chip to return to the full Mpc box anytime).
//   2. "Open 120 Sightlines →" — opens the halo's full 120-ray sightline explorer on galaxies.tanmaysingh.uk or icm.tanmaysingh.uk.

let HALO_CACHE = null;

export async function loadCosmicWebHalos(url = "data/cosmic_web_halos.json") {
  if (HALO_CACHE) return HALO_CACHE;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    HALO_CACHE = await r.json();
    return HALO_CACHE;
  } catch {
    return {};
  }
}

const HALO_CSS = `
.v3d-halo-hud{position:absolute;left:12px;top:46px;z-index:6;width:min(316px,calc(100% - 24px));padding:11px 13px 12px;
  border:1px solid var(--s-edge,rgba(200,215,240,.22));border-radius:var(--r-m,16px);
  background:linear-gradient(165deg,rgba(24,32,52,.82),rgba(10,14,24,.88));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 18px 44px rgba(0,0,0,.55);
  backdrop-filter:blur(28px) saturate(1.7);-webkit-backdrop-filter:blur(28px) saturate(1.7);
  color:var(--s-ink,#e9eef4);font:12px/1.4 var(--sans,system-ui,sans-serif);pointer-events:auto;color-scheme:dark;
  transition:opacity .18s ease,transform .18s ease}
.v3d-halo-hud[hidden],.v3d-thumb .v3d-halo-hud{display:none!important}
.v3d-halo-hud .hh-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px}
.v3d-halo-hud .hh-badge{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;
  font:600 10px/1.3 var(--mono,ui-monospace,monospace);letter-spacing:.08em;text-transform:uppercase}
.v3d-halo-hud .hh-badge.galaxy{background:rgba(92,225,255,.16);color:#7ce8ff;border:1px solid rgba(92,225,255,.38)}
.v3d-halo-hud .hh-badge.cluster{background:rgba(255,184,92,.18);color:#ffcb7d;border:1px solid rgba(255,184,92,.42)}
.v3d-halo-hud .hh- badge-dot{width:6px;height:6px;border-radius:50%;background:currentColor}
.v3d-halo-hud .hh-close{width:24px;height:24px;border:0;border-radius:7px;background:rgba(255,255,255,.06);
  color:var(--s-ink2,#b3bdc9);cursor:pointer;display:grid;place-items:center;font-size:14px;line-height:1}
.v3d-halo-hud .hh-close:hover,.v3d-halo-hud .hh-close:focus-visible{background:rgba(255,255,255,.15);color:#fff}
.v3d-halo-hud .hh-title{font:600 14px/1.25 var(--sans,system-ui,sans-serif);color:#fff;margin:0 0 2px}
.v3d-halo-hud .hh-sub{font:400 11px/1.3 var(--mono,ui-monospace,monospace);color:var(--s-ink2,#b3bdc9);margin:0 0 8px}
.v3d-halo-hud .hh-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin-bottom:10px}
.v3d-halo-hud .hh-st{padding:5px 7px;border-radius:9px;background:rgba(255,255,255,.05);border:1px solid rgba(200,215,240,.11)}
.v3d-halo-hud .hh-st small{display:block;font:500 9.5px/1.2 var(--mono,ui-monospace,monospace);color:var(--s-ink2,#b3bdc9);margin-bottom:2px}
.v3d-halo-hud .hh-st b{font:600 11.5px/1.2 var(--mono,ui-monospace,monospace);color:#fff}
.v3d-halo-hud .hh-actions{display:flex;flex-direction:column;gap:6px}
.v3d-halo-hud .hh-btn{display:flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 10px;
  border-radius:9px;font:600 11.5px/1 var(--sans,system-ui,sans-serif);text-decoration:none;cursor:pointer;
  transition:filter .15s,transform .12s,background .15s}
.v3d-halo-hud .hh-btn.pri{border:1px solid rgba(130,210,255,.55);
  background:linear-gradient(180deg,rgba(125,215,255,.28),rgba(70,145,235,.22)),rgba(30,55,95,.75);
  color:#f0f8ff;box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 4px 14px rgba(30,130,240,.28)}
.v3d-halo-hud .hh-btn.pri:hover,.v3d-halo-hud .hh-btn.pri:focus-visible{filter:brightness(1.14)}
.v3d-halo-hud .hh-btn.sec{border:1px solid var(--s-edge,rgba(200,215,240,.24));
  background:linear-gradient(180deg,rgba(255,255,255,.11),rgba(255,255,255,.03));color:var(--s-ink,#e9eef4)}
.v3d-halo-hud .hh-btn.sec:hover,.v3d-halo-hud .hh-btn.sec:focus-visible{background:linear-gradient(180deg,rgba(255,255,255,.18),rgba(255,255,255,.07));color:#fff}
.v3d-halo-hud .hh-btn:active{transform:scale(.98)}
.v3d-back-cosmic{position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:7;
  display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 14px;border-radius:999px;
  border:1px solid rgba(255,210,130,.55);
  background:linear-gradient(180deg,rgba(255,190,95,.26),rgba(180,105,30,.22)),rgba(18,22,34,.85);
  color:#fff6e5;font:600 12px/1 var(--sans,system-ui,sans-serif);cursor:pointer;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 8px 24px rgba(0,0,0,.48);
  backdrop-filter:blur(20px) saturate(1.6);-webkit-backdrop-filter:blur(20px) saturate(1.6)}
.v3d-back-cosmic:hover,.v3d-back-cosmic:focus-visible{filter:brightness(1.12);border-color:#ffe0a3}
.v3d-back-cosmic[hidden],.v3d-thumb .v3d-back-cosmic{display:none!important}
.v3d-leg .hl-key{margin-top:4px;font:11px var(--sans,system-ui,sans-serif);color:var(--s-ink2,#b3bdc9);display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.v3d-leg .hl-key[hidden]{display:none}
.v3d-leg .hl-key i{display:inline-block;width:9px;height:9px;border-radius:50%;border:1.8px solid;vertical-align:middle;margin-right:4px}
`;

export function injectHaloCss() {
  if (typeof document !== "undefined" && !document.getElementById("v3d-halo-css")) {
    const st = document.createElement("style");
    st.id = "v3d-halo-css";
    st.textContent = HALO_CSS;
    document.head.appendChild(st);
  }
}

export function createHaloOverlay({
  T,
  scene,
  camera,
  stage,
  canvas,
  app,
  getH0,
  pivotTo,
  render,
  onZoomHalo,
  onExitHaloZoom,
  isZoomedHalo,
}) {
  injectHaloCss();

  const group = new T.Group();
  group.name = "cosmicWebHalos";
  group.renderOrder = 3.5;
  scene.add(group);

  const selHighlight = new T.Group();
  selHighlight.name = "selectedHaloHighlight";
  selHighlight.renderOrder = 4.5;
  selHighlight.visible = false;
  scene.add(selHighlight);

  let enabled = true;
  let activeSimId = null;
  let halos = [];
  let selectedHalo = null;
  let markerData = []; // [{halo, posVec, drawR}]

  // Build unit circle geometry for instanced / shared ring lines
  const SEG = 48;
  const unitCircle = [];
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    unitCircle.push([Math.cos(a), Math.sin(a), 0]);
  }

  // Frosted liquid-glass HUD card on the 3D stage
  const hud = document.createElement("div");
  hud.className = "v3d-halo-hud";
  hud.id = "v3-halo-hud";
  hud.dataset.testid = "v3-halo-hud";
  hud.setAttribute("role", "region");
  hud.setAttribute("aria-label", "Selected 3D Cosmic Web halo");
  hud.hidden = true;
  hud.innerHTML = `
    <div class="hh-top">
      <span class="hh-badge galaxy" id="v3-hh-badge">GALAXY</span>
      <button type="button" class="hh-close" id="v3-hh-close" aria-label="Close halo card" data-tip="Close halo card">×</button>
    </div>
    <h3 class="hh-title" id="v3-hh-title"></h3>
    <div class="hh-sub" id="v3-hh-sub"></div>
    <div class="hh-stats">
      <div class="hh-st"><small>log M*</small><b id="v3-hh-mstar">–</b></div>
      <div class="hh-st"><small>log M200c</small><b id="v3-hh-m200">–</b></div>
      <div class="hh-st"><small>R200c</small><b id="v3-hh-r200">–</b></div>
    </div>
    <div class="hh-actions">
      <button type="button" class="hh-btn pri" id="v3-halo-zoom" data-testid="v3-halo-zoom">Zoom 3D Halo (400 kpc → 12 pc)</button>
      <a class="hh-btn sec" id="v3-halo-portal" data-testid="v3-halo-portal" href="https://galaxies.tanmaysingh.uk/" target="_blank" rel="noopener">Open 120 Sightlines →</a>
    </div>
  `;
  stage.appendChild(hud);

  // Back to Cosmic Web Box chip
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "v3d-back-cosmic";
  backBtn.id = "v3-back-cosmic";
  backBtn.dataset.testid = "v3-back-cosmic";
  backBtn.hidden = true;
  backBtn.textContent = "← Back to Cosmic Web Box";
  stage.appendChild(backBtn);

  // Prevent stage canvas pointer events from firing through the HUD or back chip
  for (const node of [hud, backBtn]) {
    node.addEventListener("pointerdown", ev => ev.stopPropagation());
    node.addEventListener("pointerup", ev => ev.stopPropagation());
    node.addEventListener("click", ev => ev.stopPropagation());
    node.addEventListener("dblclick", ev => ev.stopPropagation());
  }

  hud.querySelector("#v3-hh-close").addEventListener("click", () => {
    clearSelection();
  });

  hud.querySelector("#v3-halo-zoom").addEventListener("click", () => {
    if (!selectedHalo) return;
    if (isZoomedHalo && isZoomedHalo()) {
      onExitHaloZoom?.();
    } else {
      onZoomHalo?.(selectedHalo);
    }
  });

  backBtn.addEventListener("click", () => {
    onExitHaloZoom?.();
  });

  function clearGroup(g) {
    for (const c of [...g.children]) {
      g.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
  }

  function effectiveRadius(h, H0) {
    const r = Number(h.R200c_kpc) || (h.kind === "cluster" ? 1400 : 250);
    // Keep virial rings visibly legible at full Mpc box scale while proportional to physical R200c
    const minFrac = h.kind === "cluster" ? 0.022 * H0 : 0.011 * H0;
    return Math.max(r, minFrac);
  }

  function rebuildSceneMarkers() {
    clearGroup(group);
    markerData = [];
    if (!halos.length) {
      updateLegendKey();
      render();
      return;
    }
    const H0 = getH0() || 50000;
    const ringPos = [];
    const ringCol = [];
    const ptPos = [];
    const ptCol = [];
    const ptSize = [];

    const colGal = new T.Color(0x5ce1ff);
    const colCl = new T.Color(0xffb85c);

    for (const h of halos) {
      if (!Array.isArray(h.pos_kpc) || h.pos_kpc.length !== 3) continue;
      const [x, y, z] = h.pos_kpc;
      const isCl = h.kind === "cluster";
      const c = isCl ? colCl : colGal;
      const alpha = isCl ? 0.82 : 0.62;
      const drawR = effectiveRadius(h, H0);
      const posVec = new T.Vector3(x, y, z);
      markerData.push({halo: h, posVec, drawR});

      // Add XY ring and XZ ring for 3D virial sphere silhouette
      for (let s = 0; s < SEG; s++) {
        const [c0, s0] = unitCircle[s];
        const [c1, s1] = unitCircle[s + 1];
        // XY plane ring
        ringPos.push(x + drawR * c0, y + drawR * s0, z, x + drawR * c1, y + drawR * s1, z);
        ringCol.push(c.r, c.g, c.b, alpha, c.r, c.g, c.b, alpha);
        // Orthogonal tilted ring for 3D depth
        if (isCl || s % 2 === 0) {
          ringPos.push(x + drawR * c0, y, z + drawR * s0, x + drawR * c1, y, z + drawR * s1);
          ringCol.push(c.r, c.g, c.b, alpha * 0.72, c.r, c.g, c.b, alpha * 0.72);
        }
      }

      ptPos.push(x, y, z);
      ptCol.push(c.r, c.g, c.b, isCl ? 0.95 : 0.85);
      ptSize.push(isCl ? 8.5 : 5.5);
    }

    if (ringPos.length) {
      const rg = new T.BufferGeometry();
      rg.setAttribute("position", new T.BufferAttribute(new Float32Array(ringPos), 3));
      rg.setAttribute("color", new T.BufferAttribute(new Float32Array(ringCol), 4));
      const rm = new T.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const lines = new T.LineSegments(rg, rm);
      lines.frustumCulled = false;
      lines.renderOrder = 3.5;
      group.add(lines);
    }

    if (ptPos.length) {
      const pg = new T.BufferGeometry();
      pg.setAttribute("position", new T.BufferAttribute(new Float32Array(ptPos), 3));
      pg.setAttribute("color", new T.BufferAttribute(new Float32Array(ptCol), 4));
      pg.setAttribute("size", new T.BufferAttribute(new Float32Array(ptSize), 1));
      const pm = new T.ShaderMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        vertexShader: `
          attribute float size;
          attribute vec4 color;
          out vec4 vCol;
          void main() {
            vCol = color;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size;
          }
        `,
        fragmentShader: `
          in vec4 vCol;
          out vec4 o;
          void main() {
            vec2 p = gl_PointCoord * 2.0 - 1.0;
            float r2 = dot(p, p);
            if (r2 > 1.0) discard;
            float glow = exp(-2.2 * r2);
            o = vec4(vCol.rgb, vCol.a * glow);
          }
        `,
        glslVersion: T.GLSL3,
      });
      const pts = new T.Points(pg, pm);
      pts.frustumCulled = false;
      pts.renderOrder = 3.6;
      group.add(pts);
    }

    group.visible = enabled && !(isZoomedHalo && isZoomedHalo());
    updateHighlight();
    updateLegendKey();
    render();
  }

  function updateHighlight() {
    clearGroup(selHighlight);
    if (!selectedHalo || !enabled || (isZoomedHalo && isZoomedHalo())) {
      selHighlight.visible = false;
      return;
    }
    const H0 = getH0() || 50000;
    const drawR = effectiveRadius(selectedHalo, H0) * 1.18;
    const [x, y, z] = selectedHalo.pos_kpc;
    const pts = [];
    for (let i = 0; i <= SEG; i++) {
      const [c0, s0] = unitCircle[i];
      pts.push(new T.Vector3(x + drawR * c0, y + drawR * s0, z));
    }
    const g1 = new T.BufferGeometry().setFromPoints(pts);
    const m1 = new T.LineBasicMaterial({color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false});
    const l1 = new T.Line(g1, m1);
    l1.frustumCulled = false;
    l1.renderOrder = 4.5;
    selHighlight.add(l1);
    selHighlight.visible = true;
  }

  function updateLegendKey() {
    const leg = stage.querySelector(".v3d-leg");
    if (!leg) return;
    let keyEl = leg.querySelector(".hl-key");
    if (!keyEl) {
      keyEl = document.createElement("div");
      keyEl.className = "hl-key";
      leg.appendChild(keyEl);
    }
    const zoomed = isZoomedHalo && isZoomedHalo();
    if (!enabled || !halos.length || zoomed) {
      keyEl.hidden = true;
      return;
    }
    const nGal = halos.filter(h => h.kind === "galaxy").length;
    const nCl = halos.filter(h => h.kind === "cluster").length;
    keyEl.hidden = false;
    keyEl.innerHTML =
      (nGal ? `<span><i style="border-color:#5ce1ff;background:rgba(92,225,255,.25)"></i>${nGal} galaxies</span>` : "") +
      (nCl ? `<span><i style="border-color:#ffb85c;background:rgba(255,184,92,.25)"></i>${nCl} clusters</span>` : "");
  }

  function updateHud(h) {
    if (!h) {
      hud.hidden = true;
      return;
    }
    const isCl = h.kind === "cluster";
    const badge = hud.querySelector("#v3-hh-badge");
    badge.className = `hh-badge ${isCl ? "cluster" : "galaxy"}`;
    badge.textContent = isCl ? "CLUSTER — 5-LEVEL 3D" : "GALAXY — 5-LEVEL 3D";
    hud.querySelector("#v3-hh-title").textContent = h.short_id || h.id;
    const [x, y, z] = (h.pos_kpc || [0, 0, 0]).map(v => (v / 1000).toFixed(1));
    hud.querySelector("#v3-hh-sub").textContent = `${h.id}  (${x}, ${y}, ${z}) Mpc`;
    hud.querySelector("#v3-hh-mstar").textContent = Number.isFinite(+h.logMstar) ? `${(+h.logMstar).toFixed(2)} M☉` : "–";
    hud.querySelector("#v3-hh-m200").textContent = Number.isFinite(+h.logM200c) ? `${(+h.logM200c).toFixed(2)} M☉` : "–";
    const r200 = +h.R200c_kpc || 0;
    hud.querySelector("#v3-hh-r200").textContent = r200 >= 1000 ? `${(r200 / 1000).toFixed(2)} Mpc` : `${Math.round(r200)} kpc`;

    const zoomBtn = hud.querySelector("#v3-halo-zoom");
    const zoomed = isZoomedHalo && isZoomedHalo();
    zoomBtn.textContent = zoomed ? "← Back to Cosmic Web Box" : "Zoom 3D Halo (400 kpc → 12 pc)";

    const portalA = hud.querySelector("#v3-halo-portal");
    portalA.href = h.portal_url || (isCl ? `https://icm.tanmaysingh.uk/?g=${h.id}#tab=3d` : `https://galaxies.tanmaysingh.uk/?g=${h.id}#tab=3d`);
    hud.hidden = false;
  }

  function selectHalo(haloOrId, {movePivot = true} = {}) {
    const h = typeof haloOrId === "object" && haloOrId !== null
      ? haloOrId
      : halos.find(x => String(x.id) === String(haloOrId) || String(x.short_id) === String(haloOrId));
    if (!h) return null;
    selectedHalo = h;
    updateHud(h);
    updateHighlight();
    if (movePivot && !(isZoomedHalo && isZoomedHalo())) {
      pivotTo(h.pos_kpc, "halo");
    } else {
      render();
    }
    return h;
  }

  function clearSelection() {
    selectedHalo = null;
    hud.hidden = true;
    updateHighlight();
    render();
  }

  function nearestHalo(x, y, maxPx = 16) {
    if (!enabled || !group.visible || !markerData.length) return null;
    const r = canvas.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return null;
    const v = new T.Vector3();
    const camRight = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    let best = null;
    let bestScore = maxPx;

    for (const item of markerData) {
      v.copy(item.posVec).applyMatrix4(camera.matrixWorldInverse);
      if (v.z > -camera.near) continue;
      v.applyMatrix4(camera.projectionMatrix);
      const sx = ((v.x + 1) / 2) * r.width;
      const sy = ((1 - v.y) / 2) * r.height;

      // Also compute projected screen radius of the virial ring
      v.copy(item.posVec).addScaledVector(camRight, item.drawR).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
      const rx = ((v.x + 1) / 2) * r.width;
      const ry = ((1 - v.y) / 2) * r.height;
      const ringPx = Math.hypot(rx - sx, ry - sy);

      const dCenter = Math.hypot(x - sx, y - sy);
      const dRing = Math.abs(dCenter - ringPx);
      const hitTol = Math.max(maxPx, Math.min(ringPx * 1.15, 28));
      const d = dCenter <= hitTol ? dCenter * 0.75 : dRing;
      if (d < bestScore) {
        bestScore = d;
        best = item.halo;
      }
    }
    return best;
  }

  async function syncSimulation(simId) {
    const id = simId || (typeof app.galaxy === "function" ? app.galaxy() : null) || app.config?.galaxy?.subhalo_id || "simba100_cosmic_web";
    const normSim = String(id) === "tng50_1_igm_z0" ? "tng50_cosmic_web"
      : String(id) === "illustris_1_igm_z0" ? "illustris1_cosmic_web"
      : String(id);
    activeSimId = normSim;
    const cat = await loadCosmicWebHalos();
    halos = Array.isArray(cat[normSim]) ? cat[normSim] : [];
    if (selectedHalo && !halos.some(h => h.id === selectedHalo.id)) {
      selectedHalo = null;
      hud.hidden = true;
    }
    rebuildSceneMarkers();
    return halos;
  }

  function setEnabled(on) {
    enabled = !!on;
    group.visible = enabled && !(isZoomedHalo && isZoomedHalo());
    if (!enabled && !(isZoomedHalo && isZoomedHalo())) {
      selHighlight.visible = false;
    } else {
      updateHighlight();
    }
    updateLegendKey();
    render();
    return enabled;
  }

  function setZoomedUi(zoomed, halo = selectedHalo) {
    backBtn.hidden = !zoomed;
    group.visible = enabled && !zoomed;
    selHighlight.visible = enabled && !zoomed && !!selectedHalo;
    if (halo) {
      selectedHalo = halo;
      updateHud(halo);
    }
    updateLegendKey();
  }

  return {
    group,
    hud,
    backBtn,
    get enabled() { return enabled; },
    get halos() { return halos; },
    get selected() { return selectedHalo; },
    get simId() { return activeSimId; },
    setEnabled,
    syncSimulation,
    rebuildSceneMarkers,
    nearestHalo,
    selectHalo,
    clearSelection,
    setZoomedUi,
    updateLegendKey,
    dispose() {
      clearGroup(group);
      clearGroup(selHighlight);
      scene.remove(group);
      scene.remove(selHighlight);
      hud.remove();
      backBtn.remove();
    },
  };
}
