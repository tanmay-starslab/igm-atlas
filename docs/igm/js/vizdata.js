// Pure data helpers for the 3D viewer: tng50-viz/2 manifest, WebP atlas -> raw cube, gzip, SHA-256, u8 decode, LOD, Lupton.
import {
  initFastVizWasm, wasmReady, wasm_cast_cube_ray, wasm_synthesize_voigt_12ions,
  wasm_decode_lut_volume, wasm_pack_velocity
} from "./fast_viz_wasm.js?v=20261124a";
export {initFastVizWasm, wasm_cast_cube_ray, wasm_synthesize_voigt_12ions, wasm_decode_lut_volume};
export const SCHEMA = "tng50-viz/2";
export const ION_KEYS = ["HI", "MgII", "SiII", "CII", "SiIII", "CIII", "SiIV", "CIV", "NV", "OVI", "NeVIII", "OVII"];
export const GAS_KEYS = ["nH", "T", "Z"];
export const VOL_KEYS = [...GAS_KEYS, ...ION_KEYS];
export const ION_FALLBACK = [
  ["HI", "H I", "H I 1216", "#4338CA", "#9293F8"], ["MgII", "Mg II", "Mg II 2796", "#1D4ED8", "#6EA8FE"],
  ["SiII", "Si II", "Si II 1260", "#0369A1", "#4FB3E8"], ["CII", "C II", "C II 1335", "#0E7490", "#3CC5D9"],
  ["SiIII", "Si III", "Si III 1206", "#0F766E", "#34C4B0"], ["CIII", "C III", "C III 977", "#15803D", "#4ADE80"],
  ["SiIV", "Si IV", "Si IV 1403", "#4D7C0F", "#A3D63F"], ["CIV", "C IV", "C IV 1548", "#8A6A00", "#E5C33A"],
  ["NV", "N V", "N V 1239", "#B45309", "#F5A524"], ["OVI", "O VI", "O VI 1032", "#C2410C", "#FB7A3C"],
  ["NeVIII", "Ne VIII", "Ne VIII 770", "#B91C1C", "#F26363"], ["OVII", "O VII", "O VII 21.6", "#7F1D1D", "#E07A7A"],
].map(([key, ion, label, color, color_dark]) => ({key, ion, label, color, color_dark}));
const GAS_META = {nH: {label: "nH", long: "hydrogen density nH"}, T: {label: "T", long: "temperature (nH-weighted)"}, Z: {label: "Z", long: "metallicity (nH-weighted)"}};

export function speciesList(ions, manifest) {
  const reg = Array.isArray(ions) && ions.length ? [...ions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : ION_FALLBACK;
  const have = k => !!manifest?.gas?.fields?.[k]?.cubes;
  const why = k => (!manifest ? "no 3D data in this build" : have(k) ? "" : `the ${k} cubes are not built yet`);
  const out = GAS_KEYS.map(k => ({key: k, group: "gas", label: GAS_META[k].label, long: GAS_META[k].long, color: null, color_dark: null,
    available: have(k), reason: why(k)}));
  for (const i of reg) { if (!ION_KEYS.includes(i.key)) continue;
    const ion = i.ion || ION_FALLBACK.find(f => f.key === i.key)?.ion || i.key;
    out.push({key: i.key, group: "ion", label: ion, long: `${ion} density (the ${i.label || ion} line in the spectra)`, color: i.color || null,
      color_dark: i.color_dark || i.color || null, available: have(i.key), reason: have(i.key) ? "" : !manifest ? why(i.key) : `${ion} cubes are not built yet`}); }
  return out;
}
export const VEL_COMP_KEYS = ["vx", "vy", "vz"];
export const VEL_VIEWS = [
  {key: "vlos", q: 1, signed: true, label: "v los", spoken: "line-of-sight velocity", html: "v<sub>los</sub>", long: "line-of-sight velocity, along the camera ray", words: ["toward you", "away from you"]},
  {key: "vr", q: 2, signed: true, label: "v r", spoken: "radial velocity", html: "v<sub>r</sub>", long: "radial velocity", words: ["inflow", "outflow"]},
  {key: "vphi", q: 3, signed: true, label: "v φ", spoken: "rotation velocity", html: "v<sub>φ</sub>", long: "rotational velocity about the disk normal", words: ["counter-rotating", "co-rotating"]},
  {key: "vmag", q: 4, signed: false, label: "|v|", spoken: "speed", html: "|v|", long: "speed of the mean gas velocity", words: null},
  {key: "sigmalos", q: 5, signed: false, label: "σ los", spoken: "line-of-sight dispersion", html: "σ<sub>los</sub>", long: "line-of-sight velocity dispersion along the camera ray, between voxels (no thermal or within-voxel motion)", words: null}];
export const VEL_KEYS = VEL_VIEWS.map(x => x.key);
export function velocityInfo(manifest) {
  const v = manifest?.gas?.vectors?.v, F = manifest?.gas?.fields || {};
  if (!v || !Array.isArray(v.components) || v.components.join() !== VEL_COMP_KEYS.join()) return null;
  if (!VEL_COMP_KEYS.every(k => F[k]?.kind === "velocity" && F[k]?.cubes)) return null;
  const V = isNum(v.V) ? v.V : F.vx.vmax;
  return {V, units: v.units || "km/s", frame: v.frame || F.vx.frame || "", components: VEL_COMP_KEYS};
}
export function velocityList(manifest) {
  const ok = !!velocityInfo(manifest), reason = ok ? "" : !manifest ? "no 3D data in this build" : "the velocity cubes are not built yet";
  return VEL_VIEWS.map(x => ({...x, group: "vel", color: null, color_dark: null, available: ok, reason}));
}

/* Zero-storage TEMET cosmic-web thermodynamic fields (computed on-the-fly from nH, T, Z, vx, vy, vz). */
const L23 = Math.log10(2.3), LK0 = Math.log10(8.617333262e-8) - (2 / 3) * Math.log10(1.16);
const LTC0 = Math.log10((1.5 * 2.3 / 1.16) * 1.380649e-16 / 3.15576e16);
const LCS0 = Math.log10(Math.sqrt((5 / 3) * 1.380649e-16 / (0.6 * 1.6726219e-24)) / 1e5);
export const THERMO_FIELDS = [
  ["Pth", "Pth", "P<sub>th</sub>", "thermal pressure", "WHIM thermal pressure Pth / kB", "K cm^-3", "mass_weighted", -5, 7, "inferno", "weighted_mean", "K cm^-3", -1, 4.5, -2, 5, ["nH", "T"], []],
  ["K", "K", "K", "cosmic-web entropy", "cosmic-web entropy K", "keV cm^2", "mass_weighted", -2, 5.5, "viridis", "weighted_mean", "keV cm^2", 0.5, 4, 0.5, 4.5, ["nH", "T"], []],
  ["EM", "EM", "EM", "emission measure", "WHIM emission measure nH^2 T^(1/2)", "cm^-6 K^1/2", "density", -14, 2, "magma", "column", "cm^-5 K^1/2", 14.5, 21.5, -10, -1, ["nH", "T"], []],
  ["tcool", "tcool", "t<sub>cool</sub>", "cooling time", "radiative cooling time", "Gyr", "mass_weighted", -3, 4, "tng_ice", "weighted_mean", "Gyr", -1, 2.5, -1.5, 2.5, ["nH", "T"], ["Z"]],
  ["Mach", "Mach", "ℳ", "thermal Mach number", "accretion-shock thermal Mach number", "", "mass_weighted", -1.5, 2, "inferno", "weighted_mean", "", -0.5, 1.2, -0.3, 1.3, ["T", "vx", "vy", "vz"], []]
].map(([key, label, html, spoken, long, units, kind, vmin, vmax, cmap, pk, pu, p0, p1, w0, w1, deps, optDeps]) => ({
  key, label, html, spoken, long, units, kind, vmin, vmax, cmap,
  proj: {kind: pk, ...(pk === "weighted_mean" ? {weight: "nH"} : {}), units: pu, vmin: p0, vmax: p1},
  vol_window: [w0, w1], deps, optDeps
}));
export const THERMO_KEYS = THERMO_FIELDS.map(f => f.key);
export const thermoMeta = key => THERMO_FIELDS.find(f => f.key === key) || null;
export function thermoField(key, m) {
  const f = thermoMeta(key), F = m?.gas?.fields; if (!f || !F || (key === "Mach" && !velocityInfo(m)) || !f.deps.every(d => F[d]?.cubes)) return null;
  const lv = (m.gas.levels || Object.keys(m.levels || {})).filter(L => f.deps.every(d => F[d]?.cubes?.[L]));
  if (!lv.length) return null;
  const cubes = {}; for (const L of lv) { const n = m.levels?.[L]?.n || 256; cubes[L] = {vmin: f.vmin, vmax: f.vmax, raw_bytes: n * n * n, derived: true}; }
  return {...f, cubes};
}
export function thermoList(m) {
  return THERMO_FIELDS.map(f => { const ok = !!thermoField(f.key, m);
    return {key: f.key, group: "thermo", label: f.label, html: f.html, spoken: f.spoken, long: f.long, color: null, color_dark: null, available: ok,
      reason: ok ? "" : !m ? "no 3D data in this build" : f.key === "Mach" ? "requires T and velocity cubes" : "requires nH and T cubes"}; });
}
export function computeThermoCube(key, inp, rng) {
  const f = thermoMeta(key); if (!f) throw new Error(`unknown thermo field ${key}`);
  const N = inp[f.deps[0]].length, out = new Uint8Array(N), v0 = f.vmin, sc = 254 / (f.vmax - v0);
  const lutL = r => { const a = new Float32Array(256), s = (r[1] - r[0]) / 254; for (let q = 1; q < 256; q++) a[q] = r[0] + (q - 1) * s; return a; };
  const enc = v => { const q = Math.round((v - v0) * sc) + 1; return q < 1 ? 1 : q > 255 ? 255 : q; };
  const lT = lutL(rng.T);
  if (key === "Mach") {
    const {T: qT, vx: qx, vy: qy, vz: qz} = inp, V = rng.V, cs = new Float32Array(256), vl = new Float32Array(256);
    for (let q = 1; q < 256; q++) { cs[q] = LCS0 + 0.5 * lT[q]; vl[q] = -V + (q - 1) * (2 * V / 254); }
    for (let i = 0; i < N; i++) { const t = qT[i], a = qx[i], b = qy[i], c = qz[i]; if (!t || !a || !b || !c) continue;
      const v2 = vl[a] ** 2 + vl[b] ** 2 + vl[c] ** 2; out[i] = enc(0.5 * Math.log10(v2 > 0.01 ? v2 : 0.01) - cs[t]); }
    return out;
  }
  const {nH: qN, T: qT, Z: qZ} = inp, lN = lutL(rng.nH);
  if (key === "tcool") {
    const ff = new Float64Array(256), hh = new Float64Array(256), zz = new Float64Array(256), zL = new Float64Array(256).fill(0.1);
    for (let q = 1; q < 256; q++) { const t = lT[q], cut = 1 / (1 + Math.exp(-10 * (t - 3.95)));
      ff[q] = 1.8e-27 * (10 ** (0.5 * t));
      hh[q] = cut * (10 ** -21.8 * Math.exp(-((t - 4.3) ** 2) / 0.18) + 10 ** -22.2 * Math.exp(-((t - 4.95) ** 2) / 0.25)) + 1e-26;
      zz[q] = cut * (10 ** -21.1 * Math.exp(-((t - 5.3) ** 2) / 0.32) + 10 ** -22.1 * Math.exp(-((t - 6.3) ** 2) / 0.4)); }
    if (qZ && rng.Z) { const lZ = lutL(rng.Z); for (let q = 1; q < 256; q++) zL[q] = Math.min(10, 10 ** lZ[q]); }
    for (let i = 0; i < N; i++) { const a = qN[i], b = qT[i]; if (!a || !b) continue;
      out[i] = enc(LTC0 + lT[b] - lN[a] - Math.log10(ff[b] + hh[b] + (qZ ? zL[qZ[i]] : 0.1) * zz[b])); }
    return out;
  }
  for (let i = 0; i < N; i++) { const a = qN[i], b = qT[i]; if (!a || !b) continue;
    out[i] = enc(key === "Pth" ? L23 + lN[a] + lT[b] : key === "K" ? lT[b] - (2 / 3) * lN[a] + LK0 : 2 * lN[a] + 0.5 * lT[b]); }
  return out;
}
export function decodeLinear(q, vmin, vmax) {
  if (wasmReady() && q instanceof Uint8Array && q.length >= 64) {
    return wasm_decode_lut_volume(q, vmin, vmax, {mode: 0});
  }
  const out = new Float32Array(q.length), s = (vmax - vmin) / 254;
  for (let i = 0; i < q.length; i++) out[i] = q[i] === 0 ? NaN : vmin + (q[i] - 1) * s;
  return out;
}
export function encodeLinear(v, V) {
  const out = new Uint8Array(v.length);
  for (let i = 0; i < v.length; i++) { const x = v[i]; out[i] = Number.isFinite(x) ? 1 + Math.round((Math.min(V, Math.max(-V, x)) + V) / (2 * V) * 254) : 0; }
  return out;
}
export function packVelocity(qx, qy, qz) {
  const N = qx.length; if (qy.length !== N || qz.length !== N) throw new Error("packVelocity: the component cubes differ in size");
  if (wasmReady() && qx instanceof Uint8Array && qy instanceof Uint8Array && qz instanceof Uint8Array && N >= 64) {
    return wasm_pack_velocity(qx, qy, qz);
  }
  const out = new Uint8Array(4 * N);
  for (let i = 0, o = 0; i < N; i++, o += 4) {
    const a = qx[i], b = qy[i], c = qz[i];
    if (a === 0 || b === 0 || c === 0) { out[o] = out[o + 1] = out[o + 2] = 128; out[o + 3] = 0; }
    else { out[o] = a; out[o + 1] = b; out[o + 2] = c; out[o + 3] = 255; } }
  return out;
}
export function velQuantity(key, v, p, d) {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (key === "vlos" || key === "sigmalos") return dot(v, d);
  if (key === "vr") { const r = Math.hypot(...p); return r > 1e-4 ? dot(v, p) / r : 0; }
  if (key === "vphi") { const r = Math.hypot(p[0], p[1]); return r > 1e-4 ? (-v[0] * p[1] + v[1] * p[0]) / r : 0; }
  if (key === "vmag") return Math.hypot(...v);
  throw new Error(`unknown velocity view ${key}`);
}
export function velRayMoment(key, samples, d) {
  let s0 = 0, s1 = 0, s2 = 0;
  for (const {w, v, p} of samples) { if (!(w > 0)) continue; const x = velQuantity(key, v, p, d); s0 += w; s1 += w * x; s2 += w * x * x; }
  if (!(s0 > 0)) return NaN;
  const m = s1 / s0; return key === "sigmalos" ? Math.sqrt(Math.max(0, s2 / s0 - m * m)) : m;
}
export const GAS_LEVELS = {L0: 400.0, L1: 100.0, L2: 25.0, L3: 6.25, L4: 1.5};
export const STAR_LEVELS = {S0: 400.0, S1: 100.0, S2: 25.0, S3: 6.25, S4: 1.5};
export const SMOOTH = {stars: [0, 0, 0, 0, 0]};
export const STAR_COMP = {mode: 1, occ: [0.4, 0.9], floor: 0.035, core: 0.92, halo: 0.12};
export const STAR_ZOOM = {h: [12, 90], dmag: [-0.5, 1.5], occWide: [0.08, 0.25]};
export const MU_ZERO = 36.57212566588;                 // mag arcsec^-2 of 1 L_AB0 per kpc^2 (design §2.7)
export const CM_PER_KPC = 3.0856775814913673e21;
export const LUT_NAMES = ["tng_dusk", "tng_ice", "magma", "inferno", "viridis", "cividis", "grey"];

const isNum = x => typeof x === "number" && Number.isFinite(x);
const isInt = x => Number.isInteger(x);
const isStr = x => typeof x === "string";
const isObj = x => x !== null && typeof x === "object" && !Array.isArray(x);
const isHex = (x, n) => isStr(x) && new RegExp(`^[0-9a-f]{${n}}$`).test(x);
const isVec = (x, n) => Array.isArray(x) && x.length === n && x.every(isNum);

/* final: a timeout, so a ?viz= host that accepts the connection and never answers ends in an error (and a stage message)
   instead of a 3D tab that stays blank. opts.fetchText(url, timeoutMs) -> text is the page's network helper (vizload.js
   fetchText, i.e. netFetch with its stall timer); without it, a plain fetch with an AbortController deadline (node, tests).
   The error carries .timeout or .network, so the caller can tell an unreachable host from a bad manifest. */
export async function loadManifestV2(url, {timeoutMs = 10000, fetchText = null} = {}) {
  let host = "the host"; try { host = new URL(url).host; } catch { /* keep */ }
  let txt;
  if (fetchText) {
    try { txt = await fetchText(url, timeoutMs); }
    catch (x) { const e = new Error(`viz manifest: ${x.timeout ? `no answer from ${host} within ${Math.round(timeoutMs / 1000)} s` : x.http ? `HTTP ${x.http}` : x.message}`);
      e.timeout = !!x.timeout; e.network = !!(x.timeout || x.network || x instanceof TypeError); e.http = x.http; throw e; }
  } else {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeoutMs);
    try { const r = await fetch(url, {cache: "no-cache", signal: ac.signal});
      if (!r.ok) throw Object.assign(new Error(`viz manifest: HTTP ${r.status}`), {http: r.status});
      txt = await r.text(); }
    catch (x) { if (ac.signal.aborted) throw Object.assign(new Error(`viz manifest: no answer from ${host} within ${Math.round(timeoutMs / 1000)} s`), {timeout: true, network: true});
      if (x instanceof TypeError) x.network = true; throw x; }
    finally { clearTimeout(t); }
  }
  let m; try { m = JSON.parse(txt); } catch { throw new Error("viz manifest: not valid JSON"); }
  validateManifestV2(m);
  return m;
}

/* Mirrors tngsight.vizpack.validate_manifest_v2's key/type checks (design §3.3); throws Error naming the first problem. */
export function validateManifestV2(m) {
  const bad = (where, what) => { throw new Error(`viz manifest: ${where}: ${what}`); };
  const need = (o, where, keys) => { if (!isObj(o)) bad(where, "missing or not an object"); for (const [k, t] of keys) if (!t(o[k])) bad(`${where}.${k}`, "missing or wrong type"); };
  if (!isObj(m)) bad("root", "not an object");
  if (m.schema !== SCHEMA) bad("schema", `expected "${SCHEMA}", got ${JSON.stringify(m.schema)}`);
  need(m, "root", [["created", isStr], ["generator", isObj], ["galaxy", isObj], ["frame", isObj], ["order", isStr], ["kernel", isObj],
    ["encoding", isObj], ["formats", isObj], ["levels", isObj], ["gas", isObj]]);
  need(m.galaxy, "galaxy", [["subhalo_id", x => isInt(x) || (isStr(x) && x.length > 0)], ["TNG_H", isNum], ["R200c_kpc", isNum], ["center_kpc", x => isVec(x, 3)],
    ["Lhat", x => isVec(x, 3)], ["xhat", x => isVec(x, 3)], ["yhat", x => isVec(x, 3)]]);
  need(m.frame, "frame", [["name", isStr], ["rows", x => Array.isArray(x) && x.length === 3 && x.every(r => isVec(r, 3))]]);
  need(m.encoding, "encoding", [["type", x => x === "log10-u8"], ["empty", x => x === 0], ["q_min", x => x === 1], ["q_max", x => x === 255]]);
  need(m.formats, "formats", [["webp", isObj], ["gz", isObj]]);
  need(m.formats.webp, "formats.webp", [["parts", x => x === 4], ["slices_per_part", x => x === 64], ["cols", x => x === 16], ["rows", x => x === 4]]);
  const levelKeys = Object.keys(m.levels);
  for (const L of levelKeys) {
    if (!/^[LS][0-4]$/.test(L)) bad(`levels.${L}`, "unknown level");
    need(m.levels[L], `levels.${L}`, [["half_kpc", isNum], ["n", x => isInt(x) && x > 0], ["voxel_kpc", isNum], ["r_mask_kpc", x => x === null || isNum(x)]]);
    if (!/^[LS]0$/.test(L) && m.levels[L].r_mask_kpc !== null) bad(`levels.${L}.r_mask_kpc`, "expected null");
    const v = m.levels[L]; if (Math.abs(v.voxel_kpc - 2 * v.half_kpc / v.n) > 1e-9 * v.half_kpc) bad(`levels.${L}.voxel_kpc`, "≠ 2*half_kpc/n");
  }
  const cube = (c, where, kind, L, vmin, vmax) => {
    need(c, where, [["vmin", isNum], ["vmax", isNum], ["raw_bytes", isInt], ["raw_sha256", x => isHex(x, 64)], ["webp", isObj], ["gz", isObj], ["stats", isObj], ["deposit", isObj]]);
    if (!(c.vmax > c.vmin)) bad(where, "vmax ≤ vmin");
    if (vmin !== undefined && (c.vmin !== vmin || c.vmax !== vmax)) bad(where, "cube vmin/vmax differ from the field's");
    const n = m.levels[L]?.n; if (!n) bad(where, `level ${L} not in levels`);
    if (c.raw_bytes !== (kind === "stars" ? 4 : 1) * n * n * n) bad(`${where}.raw_bytes`, `expected ${(kind === "stars" ? "4*" : "") + n}³`);
    need(c.webp, `${where}.webp`, [["paths", x => Array.isArray(x) && x.length === 4 && x.every(isStr)], ["bytes", x => Array.isArray(x) && x.length === 4 && x.every(isInt)],
      ["sha256", x => Array.isArray(x) && x.length === 4 && x.every(s => isHex(s, 64))]]);
    need(c.gz, `${where}.gz`, [["path", isStr], ["bytes", isInt], ["sha256", x => isHex(x, 64)]]);
    const id12 = c.raw_sha256.slice(0, 12), stem = where.startsWith("gas") ? `gas/${L}/${where.split(".")[2]}` : `stars/${L}/gri`;
    c.webp.paths.forEach((p, i) => { if (p !== `${stem}.${id12}.p${i}.webp`) bad(`${where}.webp.paths[${i}]`, `expected ${stem}.${id12}.p${i}.webp`); });
    if (c.gz.path !== `${stem}.${id12}.${kind === "stars" ? "rgba" : "u8"}.gz`) bad(`${where}.gz.path`, "does not follow the §2.6 naming");
  };
  need(m.gas, "gas", [["levels", x => Array.isArray(x) && x.every(L => /^[LS][0-4]$/.test(L) && L[0] === "L")], ["fields", isObj]]);
  for (const [k, f] of Object.entries(m.gas.fields)) {
    const w = `gas.fields.${k}`;
    /* vel3d: vx, vy, vz are linear velocity fields with no proj / vol_window (the viewer derives its windows) */
    if (VEL_COMP_KEYS.includes(k)) {
      need(f, w, [["label", isStr], ["units", isStr], ["kind", x => x === "velocity"], ["encoding", x => x === "linear"], ["component", x => x === k[1]],
        ["vmin", isNum], ["vmax", isNum], ["cmap", isStr], ["cubes", isObj]]);
      if (!(f.vmax > 0 && Math.abs(f.vmin + f.vmax) <= 1e-9 * f.vmax)) bad(w, "vmin must be −vmax < 0");
      for (const L of m.gas.levels) cube(f.cubes[L], `${w}.cubes.${L}`, "gas", L, f.vmin, f.vmax);
      continue;
    }
    if (!VOL_KEYS.includes(k)) bad(w, "unknown field");
    if (f.encoding !== undefined && !["log", "log10-u8"].includes(f.encoding)) bad(`${w}.encoding`, "unknown encoding");   // missing = log
    need(f, w, [["label", isStr], ["units", isStr], ["kind", x => ["density", "mass_weighted"].includes(x)], ["vmin", isNum], ["vmax", isNum],
      ["cmap", isStr], ["proj", isObj], ["vol_window", x => isVec(x, 2)], ["cubes", isObj]]);
    need(f.proj, `${w}.proj`, [["kind", x => ["column", "weighted_mean"].includes(x)], ["vmin", isNum], ["vmax", isNum]]);
    if (!(f.proj.vmax > f.proj.vmin)) bad(`${w}.proj`, "vmax ≤ vmin");
    for (const L of m.gas.levels) cube(f.cubes[L], `${w}.cubes.${L}`, "gas", L, f.vmin, f.vmax);
  }
  /* vel3d: optional gas.vectors (an old manifest has none: the velocity views are then shown as unavailable) */
  if (m.gas.vectors !== undefined) {
    if (!isObj(m.gas.vectors)) bad("gas.vectors", "not an object");
    for (const [name, v] of Object.entries(m.gas.vectors)) {
      const w = `gas.vectors.${name}`;
      need(v, w, [["components", x => Array.isArray(x) && x.length === 3 && x.every(isStr)], ["units", isStr], ["frame", isStr], ["V", x => isNum(x) && x > 0]]);
      for (const c of v.components) { const f = m.gas.fields[c];
        if (!f) bad(`${w}.components`, `${c} is not a gas field`);
        if (f.kind !== "velocity") bad(`${w}.components`, `${c} is not a velocity field`);
        if (f.vmax !== v.V || f.vmin !== -v.V) bad(`${w}.V`, `${c} is not encoded on ±V`); }
    }
  }
  if (m.stars !== undefined && m.stars !== null) {
    need(m.stars, "stars", [["levels", x => Array.isArray(x) && x.every(L => /^[LS][0-4]$/.test(L) && L[0] === "S")], ["bands", x => Array.isArray(x) && x.join() === "i,r,g"],
      ["display", isObj], ["cubes", isObj]]);
    need(m.stars.display, "stars.display", [["Q", isNum], ["mu0", isNum], ["mu_zero", isNum], ["balance", x => isVec(x, 3)]]);
    for (const L of m.stars.levels) cube(m.stars.cubes[L], `stars.cubes.${L}`, "stars", L);
  }
  if (m.luts !== undefined) need(m.luts, "luts", [["path", isStr], ["sha256", x => isHex(x, 64)], ["names", x => Array.isArray(x) && x.every(isStr)]]);
}

export function cubeRef(manifest, kind, key, level) {
  const c = kind === "stars" ? manifest?.stars?.cubes?.[level] : manifest?.gas?.fields?.[key]?.cubes?.[level];
  if (!c) throw new Error(`no ${kind === "stars" ? "star" : key} cube at ${level}`);
  return c;
}
export function cubeUrls(cube, base) { return {webp: cube.webp.paths.map(p => base + p), gz: base + cube.gz.path}; }

/* §2.4 inverse. parts: 4 RGBA image-data arrays (16n × 4n px each). Gas -> n³ bytes (R channel); stars -> 4n³ RGBA,
   A = 255 if any of R, G, B > 0. Slice k lives in part k >> 6, tile (column s % 16, row s >> 4) with s = k & 63. */
export function atlasToRaw(parts, n, kind) {
  const W = 16 * n, H = 4 * n, stars = kind === "stars", out = new Uint8Array((stars ? 4 : 1) * n * n * n);
  if (!Array.isArray(parts) || parts.length !== 4) throw new Error("atlasToRaw: expected 4 parts");
  parts.forEach((p, i) => { if (!p || p.length !== W * H * 4) throw new Error(`atlasToRaw: part ${i} has ${p?.length} bytes, expected ${W}×${H}×4`); });
  let hasDustAlpha = false;
  if (stars) {
    outer: for (const p of parts) for (let i = 3; i < p.length; i += 4) if (p[i] < 255) { hasDustAlpha = true; break outer; }
  }
  for (let k = 0; k < n; k++) {
    const P = parts[k >> 6], s = k & 63, x0 = (s & 15) * n, y0 = (s >> 4) * n;
    for (let j = 0; j < n; j++) {
      let src = ((y0 + j) * W + x0) * 4, dst = n * (j + n * k);
      if (!stars) for (let i = 0; i < n; i++, src += 4) out[dst + i] = P[src];
      else for (let i = 0, d = 4 * dst; i < n; i++, src += 4, d += 4) {
        const r = P[src], g = P[src + 1], b = P[src + 2], a = P[src + 3];
        out[d] = r; out[d + 1] = g; out[d + 2] = b; out[d + 3] = hasDustAlpha ? a : ((r | g | b) ? 255 : 0); }
    }
  }
  return out;
}

/* gzip (1f 8b) -> DecompressionStream; anything else is taken as already decoded (a server applied Content-Encoding) */
export async function gunzipIfNeeded(buf) {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (!(u.length >= 2 && u[0] === 0x1f && u[1] === 0x8b)) return u;
  if (typeof DecompressionStream === "undefined") throw new Error("this browser cannot decode the volumes");
  const out = await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  return new Uint8Array(out);
}

/* SHA-256 hex: crypto.subtle when present (secure contexts), else a plain JS implementation (http pages). */
export async function sha256Hex(u8) {
  const s = globalThis.crypto?.subtle;
  if (s) { const d = new Uint8Array(await s.digest("SHA-256", u8)); return Array.from(d, b => b.toString(16).padStart(2, "0")).join(""); }
  return sha256Js(u8);
}
const K256 = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
  0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138,
  0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624,
  0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f,
  0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
export function sha256Js(u8) {
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const n = u8.length, tail = new Uint8Array(((n + 9 + 63) >> 6) * 64 - (n & ~63)), W = new Uint32Array(64);
  tail.set(u8.subarray(n & ~63)); tail[n & 63] = 0x80;
  const bits = n * 8, dv = new DataView(tail.buffer); dv.setUint32(tail.length - 8, Math.floor(bits / 2 ** 32)); dv.setUint32(tail.length - 4, bits >>> 0);
  const block = (b, o) => {
    for (let t = 0; t < 16; t++) W[t] = (b[o + 4 * t] << 24) | (b[o + 4 * t + 1] << 16) | (b[o + 4 * t + 2] << 8) | b[o + 4 * t + 3];
    for (let t = 16; t < 64; t++) { const x = W[t - 15], y = W[t - 2];
      W[t] = (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) + W[t - 7] + (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)) + W[t - 16]; }
    let [a, bb, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K256[t] + W[t]) | 0;
      const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0; }
    H[0] += a; H[1] += bb; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h; };
  for (let o = 0; o + 64 <= (n & ~63); o += 64) block(u8, o);
  for (let o = 0; o < tail.length; o += 64) block(tail, o);
  return Array.from(H, x => x.toString(16).padStart(8, "0")).join("");
}

export function decodeU8(q, vmin, vmax) {
  if (wasmReady() && q instanceof Uint8Array && q.length >= 64) {
    return wasm_decode_lut_volume(q, vmin, vmax, {mode: 0});
  }
  const out = new Float32Array(q.length), s = (vmax - vmin) / 254;
  for (let i = 0; i < q.length; i++) out[i] = q[i] === 0 ? NaN : vmin + (q[i] - 1) * s;
  return out;
}

export function levelForView({hVisKpc, mobile = false, deviceMemory = 8} = {}) {
  const h = Number.isFinite(hVisKpc) ? hVisKpc : 153;
  if (mobile) return {gas: h < 60 ? ["L1", "L0", "L2"] : ["L1", "L0"], stars: h < 60 ? ["S1", "S2"] : ["S1"], parallel: false};
  const parallel = (deviceMemory ?? 8) >= 4;
  return {gas: ["L1", "L0", "L2"], stars: h > 150 ? ["S1", "S2", "S0"] : ["S1", "S2"], parallel};
}

export function viewPlan({ratio = {}, hVisKpc, hVisPhysKpc, halfL2 = 25, halfL3 = 6.25, halfL4 = 1.5, mobile = false, stars = false, hasL3 = false, hasL4 = false} = {}) {
  const h = Number.isFinite(hVisKpc) ? hVisKpc : 153, hPhys = Number.isFinite(hVisPhysKpc) ? hVisPhysKpc : h, r = k => (Number.isFinite(ratio[k]) ? ratio[k] : 0);
  const h2 = Number.isFinite(halfL2) && halfL2 > 0 ? halfL2 : 25;
  const h3 = Number.isFinite(halfL3) && halfL3 > 0 ? halfL3 : 6.25;
  const fine = !mobile || h < 60;
  const gas = ["L0"], st = [];
  if (!Number.isFinite(ratio.L1) || r("L1") >= 0.5) gas.push("L1");
  if (stars) st.push("S1");
  const order = [...gas.map(L => ["gas", L]), ...st.map(S => ["stars", S])];
  if (fine && r("L2") >= 1) order.push(["gas", "L2"]);
  if (stars && fine && r("S2") >= 1) order.push(["stars", "S2"]);
  const thL3 = Math.max(25, h2), thL4 = Math.max(6.25, h3);
  if (fine && hPhys < thL3 && (r("L3") >= 0.35 || (hasL3 && (r("L3") >= 0.15 || !Number.isFinite(ratio.L3))))) order.push(["gas", "L3"]);
  if (stars && fine && hPhys < thL3 && (r("S3") >= 0.35 || r("L3") >= 0.35 || (hasL3 && (r("S3") >= 0.15 || r("L3") >= 0.15 || !Number.isFinite(ratio.S3))))) order.push(["stars", "S3"]);
  if (fine && hPhys < thL4 && (r("L4") >= 0.35 || (hasL4 && (r("L4") >= 0.15 || !Number.isFinite(ratio.L4))))) order.push(["gas", "L4"]);
  if (stars && fine && hPhys < thL4 && (r("S4") >= 0.35 || r("L4") >= 0.35 || (hasL4 && (r("S4") >= 0.15 || r("L4") >= 0.15 || !Number.isFinite(ratio.S4))))) order.push(["stars", "S4"]);
  if (stars && !mobile && h > 150) order.push(["stars", "S0"]);
  return {order, gas: order.filter(o => o[0] === "gas").map(o => o[1]), stars: order.filter(o => o[0] === "stars").map(o => o[1])};
}

/* Lupton et al. (2004) asinh composite, design §4.5: surface brightnesses S_b [L_AB0 kpc^-2] -> sRGB values 0..1. */
export function lupton(Si, Sr, Sg, {Q = 8.0, mu0 = 21.5, balance = [1, 1, 1]} = {}) {
  const S0 = 10 ** (0.4 * (MU_ZERO - mu0));
  let R = balance[0] * Si / S0, G = balance[1] * Sr / S0, B = balance[2] * Sg / S0;
  const I = (R + G + B) / 3, F = I > 0 ? Math.asinh(Q * I) / (Q * I) : 0;
  R *= F; G *= F; B *= F;
  const m = Math.max(R, G, B); if (m > 1) { R /= m; G /= m; B /= m; }
  return [R, G, B];
}

export function smoothCube(q, n, vmin, vmax, passes = 2, ch = 1) {
  const N = n * n * n, span = vmax - vmin, dec = new Float32Array(256);
  for (let i = 1; i < 256; i++) dec[i] = 10 ** ((i - 1) * span / 254 - span);   // normalised to 10^vmax
  const f = new Float32Array(N), line = new Float32Array(n), out = new Uint8Array(N * ch), lo = 0.5 * dec[1], k = 254 / span, LN10 = Math.LN10;
  for (let c = 0; c < Math.min(ch, 3); c++) {
    for (let i = 0; i < N; i++) f[i] = dec[q[i * ch + c]];
    for (let p = 0; p < passes; p++) for (const st of [1, n, n * n]) {
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        const base = st === 1 ? n * (a + n * b) : st === n ? a + n * n * b : a + n * b;
        for (let i = 0; i < n; i++) line[i] = f[base + i * st];
        for (let i = 0; i < n; i++) { const l = line[i > 0 ? i - 1 : 1], r = line[i < n - 1 ? i + 1 : n - 2]; f[base + i * st] = 0.25 * (l + r) + 0.5 * line[i]; }
      }
    }
    for (let i = 0; i < N; i++) { const v = f[i]; if (!(v >= lo)) continue;
      const x = Math.round((Math.log(v) / LN10 + span) * k) + 1; out[i * ch + c] = x < 1 ? 1 : x > 255 ? 255 : x; }
  }
  if (ch === 4) for (let i = 0; i < N; i++) out[4 * i + 3] = (out[4 * i] | out[4 * i + 1] | out[4 * i + 2]) ? 255 : 0;
  return out;
}
