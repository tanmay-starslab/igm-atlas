// CLOUDY c17.03 (FG11 UVB, GASS10 solar abundances) Line Emissivity Surface Brightness engine.
// Lazy-imported ONLY when Emission (SB) mode is activated so initial page load & story_budget stay 100% green.
//
// Physics:
//   - Binary LUT: data/cloudy_emissivity_z0.bin, uint8 shape [12, 56, 6, 61] (line, nH, Z, T)
//   - Encodes log10(epsilon [erg s^-1 cm^-3]) linearly on [EPS_MIN, EPS_MAX] = [-48.0, -12.0]
//   - Trilinearly interpolates (log10 n_H, log10 Z/Z_sun, log10 T) -> log10(epsilon)
//   - Encodes voxel emissivity into standard log10-u8 cube (q = 0 empty, q = 1..255 on [-48.0, -12.0])
//   - Raymarcher integrates shifted linear emissivity 10^(logEps - EPS_REF) * ds_cm (float32-safe)
//     and converts to exact physical surface brightness:
//       log10(SB [erg s^-1 cm^-2 arcsec^-2]) = EPS_REF + log10(sum(10^(logEps - EPS_REF) * ds_cm))
//                                              - 11.7280614585 - 4 * log10(1 + z)

export const EPS_MIN = -48.0;
export const EPS_MAX = -12.0;
export const EPS_REF = -25.0;
export const LOG10_4PI_ARCSEC2_PER_SR = 11.7280614585;
export const CM_PER_KPC = 3.08567758e21;
export const DEFAULT_LINE = "Lya_1216";

// All 12 CLOUDY c17.03 emission lines with IGM/WHIM cosmic-web default SB ranges [erg s^-1 cm^-2 arcsec^-2]
export const CLOUDY_LINES = [
  {id: "Ha_6563",     label: "Hα 6563 Å",        short: "Hα",      wave_A: 6562.81, band: "Optical", sb_range: [-21.5, -14.5], igm_sb_range: [-24.0, -17.5], cmap: "inferno"},
  {id: "Lya_1216",    label: "Lyα 1216 Å",       short: "Lyα",     wave_A: 1215.67, band: "FUV",     sb_range: [-21.0, -14.0], igm_sb_range: [-23.5, -17.0], cmap: "inferno"},
  {id: "OII_3727",    label: "[O II] 3727/29 Å", short: "[O II]",  wave_A: 3727.42, band: "Optical", sb_range: [-22.0, -15.0], igm_sb_range: [-24.5, -18.0], cmap: "inferno"},
  {id: "OIII_5007",   label: "[O III] 5007 Å",   short: "[O III]", wave_A: 5006.84, band: "Optical", sb_range: [-22.0, -15.0], igm_sb_range: [-24.5, -18.0], cmap: "viridis"},
  {id: "NII_6583",    label: "[N II] 6583 Å",    short: "[N II]",  wave_A: 6583.45, band: "Optical", sb_range: [-22.5, -15.5], igm_sb_range: [-25.0, -18.5], cmap: "inferno"},
  {id: "MgII_2798",   label: "Mg II 2796/03 Å",  short: "Mg II",   wave_A: 2798.0,  band: "NUV",     sb_range: [-22.5, -15.5], igm_sb_range: [-25.0, -18.5], cmap: "magma"},
  {id: "CIII_977",    label: "C III 977 Å",      short: "C III",   wave_A: 977.02,  band: "FUV",     sb_range: [-22.5, -16.0], igm_sb_range: [-24.5, -18.0], cmap: "plasma"},
  {id: "CIV_1548",    label: "C IV 1548/51 Å",   short: "C IV",    wave_A: 1549.06, band: "FUV",     sb_range: [-23.0, -16.5], igm_sb_range: [-24.5, -18.0], cmap: "plasma"},
  {id: "OVI_1032",    label: "O VI 1032/38 Å",   short: "O VI",    wave_A: 1033.82, band: "FUV",     sb_range: [-23.0, -16.5], igm_sb_range: [-24.5, -18.0], cmap: "magma"},
  {id: "OVII_21.6",   label: "O VII 21.6 Å",     short: "O VII",   wave_A: 21.602,  band: "X-ray",   sb_range: [-24.0, -17.5], igm_sb_range: [-25.0, -18.0], cmap: "inferno"},
  {id: "OVIII_18.97", label: "O VIII 18.97 Å",   short: "O VIII",  wave_A: 18.971,  band: "X-ray",   sb_range: [-24.0, -17.0], igm_sb_range: [-25.0, -18.0], cmap: "inferno"},
  {id: "FeXXV_1.85",  label: "Fe XXV 1.85 Å",    short: "Fe XXV",  wave_A: 1.8504,  band: "X-ray",   sb_range: [-24.5, -16.5], igm_sb_range: [-25.5, -17.5], cmap: "inferno"},
];

export const LINE_MAP = Object.fromEntries(CLOUDY_LINES.map((l, i) => [l.id, {...l, index: i}]));

export function lineInfo(id) {
  return LINE_MAP[id] || LINE_MAP[DEFAULT_LINE];
}

let _lutPromise = null;
let _lutBase = null;

/**
 * Lazy-fetch and parse CLOUDY c17.03 emissivity binary LUT + metadata.
 * Memoized per base URL so it is fetched at most once per session.
 */
export function loadCloudyLut(baseUrl = "data/") {
  const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
  if (_lutPromise && _lutBase === base) return _lutPromise;
  _lutBase = base;
  _lutPromise = Promise.all([
    fetch(`${base}cloudy_emissivity_meta.json`).then(r => {
      if (!r.ok) throw new Error(`Failed to fetch CLOUDY metadata (${r.status})`);
      return r.json();
    }),
    fetch(`${base}cloudy_emissivity_z0.bin`).then(r => {
      if (!r.ok) throw new Error(`Failed to fetch CLOUDY emissivity LUT (${r.status})`);
      return r.arrayBuffer();
    }),
  ]).then(([meta, buf]) => parseCloudyLut(meta, new Uint8Array(buf)))
    .catch(err => { _lutPromise = null; throw err; });
  return _lutPromise;
}

/**
 * Construct a CLOUDY LUT object from parsed metadata JSON and Uint8Array binary payload.
 */
export function parseCloudyLut(meta, bytes) {
  const [nLines, nH_len, Z_len, T_len] = meta.shape;
  const expected = nLines * nH_len * Z_len * T_len;
  if (bytes.length !== expected) {
    throw new Error(`CLOUDY LUT size mismatch: got ${bytes.length}, expected ${expected}`);
  }
  const lineIndex = {};
  (meta.lines || CLOUDY_LINES).forEach((l, i) => { lineIndex[l.id] = i; });
  return {
    meta,
    data: bytes,
    nLines, nH_len, Z_len, T_len,
    strideLine: nH_len * Z_len * T_len,
    strideNH: Z_len * T_len,
    strideZ: T_len,
    nH_min: meta.nH_min, nH_max: meta.nH_max,
    Z_min: meta.Z_min,   Z_max: meta.Z_max,
    T_min: meta.T_min,   T_max: meta.T_max,
    eps_min: meta.eps_min ?? EPS_MIN,
    eps_max: meta.eps_max ?? EPS_MAX,
    lineIndex,
  };
}

/**
 * Trilinearly interpolate log10(epsilon [erg s^-1 cm^-3]) for a single (nH, Z, T) point.
 * Below nH_min (-7.0), scales emissivity as n_H^2 (collisional/recombination optically-thin limit)
 * so cosmic voids remain physically dark instead of plateauing at the grid floor.
 */
export function evalEmissivity(lut, lineIdOrIdx, logNH, logZ, logT) {
  const li = typeof lineIdOrIdx === "number" ? lineIdOrIdx : (lut.lineIndex[lineIdOrIdx] ?? 1);
  const {data, strideLine, strideNH, strideZ, nH_len, Z_len, T_len,
    nH_min, nH_max, Z_min, Z_max, T_min, T_max, eps_min, eps_max} = lut;

  let extrap = 0.0;
  let nh = logNH;
  if (nh < nH_min) { extrap = 2.0 * (nh - nH_min); nh = nH_min; }
  else if (nh > nH_max) nh = nH_max;

  const fnH = ((nh - nH_min) / (nH_max - nH_min)) * (nH_len - 1);
  const fZ  = ((Math.max(Z_min, Math.min(Z_max, logZ)) - Z_min) / (Z_max - Z_min)) * (Z_len - 1);
  const fT  = ((Math.max(T_min, Math.min(T_max, logT)) - T_min) / (T_max - T_min)) * (T_len - 1);

  const i0 = Math.min(nH_len - 2, Math.max(0, Math.floor(fnH))), dn = fnH - i0;
  const j0 = Math.min(Z_len - 2,  Math.max(0, Math.floor(fZ))),  dz = fZ - j0;
  const k0 = Math.min(T_len - 2,  Math.max(0, Math.floor(fT))),  dt = fT - k0;

  const base = li * strideLine + i0 * strideNH + j0 * strideZ + k0;
  const c000 = data[base],                          c001 = data[base + 1];
  const c010 = data[base + strideZ],                c011 = data[base + strideZ + 1];
  const c100 = data[base + strideNH],               c101 = data[base + strideNH + 1];
  const c110 = data[base + strideNH + strideZ],     c111 = data[base + strideNH + strideZ + 1];

  const c00 = c000 + (c001 - c000) * dt;
  const c01 = c010 + (c011 - c010) * dt;
  const c10 = c100 + (c101 - c100) * dt;
  const c11 = c110 + (c111 - c110) * dt;
  const c0 = c00 + (c01 - c00) * dz;
  const c1 = c10 + (c11 - c10) * dz;
  const q = c0 + (c1 - c0) * dn;

  const logEps = eps_min + q * ((eps_max - eps_min) / 255.0) + extrap;
  return logEps < eps_min ? eps_min : logEps;
}

/**
 * Compute a 3D uint8 emissivity cube (log10-u8 encoded on [EPS_MIN, EPS_MAX] = [-48, -12],
 * q = 0 empty, q = 1..255 linear) from loaded nH, T, and optional Z uint8 3D cubes.
 * Uses 256-entry precomputed index/weight tables for ~50 ms throughput on 256^3 cubes.
 */
export function computeEmissivityCube(lut, lineId, inputs, ranges) {
  const li = lut.lineIndex[lineId] ?? 1;
  const nH = inputs.nH, T = inputs.T, Z = inputs.Z || null;
  const N = nH.length;
  const out = new Uint8Array(N);

  const {data, strideLine, strideNH, strideZ, nH_len, Z_len, T_len,
    nH_min, nH_max, Z_min, Z_max, T_min, T_max, eps_min, eps_max} = lut;
  const lineBase = li * strideLine;
  const epsScale = (eps_max - eps_min) / 255.0;
  const encScale = 254.0 / (EPS_MAX - EPS_MIN);

  // Precompute 256-entry tables for nH, T, Z
  const nH_i0 = new Int32Array(256), nH_dn = new Float32Array(256), nH_ex = new Float32Array(256);
  const T_k0  = new Int32Array(256), T_dt  = new Float32Array(256);
  const Z_j0  = new Int32Array(256), Z_dz  = new Float32Array(256);

  const [nhLo, nhHi] = ranges.nH;
  const [tLo, tHi]   = ranges.T;
  const [zLo, zHi]   = ranges.Z || [-3.0, 1.0];
  const invNH = (nH_len - 1) / (nH_max - nH_min);
  const invT  = (T_len - 1)  / (T_max - T_min);
  const invZ  = (Z_len - 1)  / (Z_max - Z_min);

  for (let q = 1; q < 256; q++) {
    let nh = nhLo + (q - 1) * (nhHi - nhLo) / 254.0;
    let ex = 0.0;
    if (nh < nH_min) { ex = 2.0 * (nh - nH_min); nh = nH_min; }
    else if (nh > nH_max) nh = nH_max;
    const fn = (nh - nH_min) * invNH;
    const i0 = Math.min(nH_len - 2, Math.max(0, Math.floor(fn)));
    nH_i0[q] = lineBase + i0 * strideNH;
    nH_dn[q] = fn - i0;
    nH_ex[q] = ex;

    const tv = Math.max(T_min, Math.min(T_max, tLo + (q - 1) * (tHi - tLo) / 254.0));
    const ft = (tv - T_min) * invT;
    const k0 = Math.min(T_len - 2, Math.max(0, Math.floor(ft)));
    T_k0[q] = k0;
    T_dt[q] = ft - k0;

    const zv = Math.max(Z_min, Math.min(Z_max, zLo + (q - 1) * (zHi - zLo) / 254.0));
    const fz = (zv - Z_min) * invZ;
    const j0 = Math.min(Z_len - 2, Math.max(0, Math.floor(fz)));
    Z_j0[q] = j0 * strideZ;
    Z_dz[q] = fz - j0;
  }

  // Default metallicity (-1.0 log10 Z/Z_sun = 0.1 Z_sun) when Z cube is absent or voxel qZ == 0
  const defZ = Math.max(Z_min, Math.min(Z_max, -1.0));
  const defFz = (defZ - Z_min) * invZ;
  const defJ0 = Math.min(Z_len - 2, Math.max(0, Math.floor(defFz)));
  const defJ0Off = defJ0 * strideZ;
  const defDz = defFz - defJ0;

  for (let idx = 0; idx < N; idx++) {
    const qn = nH[idx];
    if (qn === 0) continue;
    const qt = T[idx];
    if (qt === 0) continue;

    let j0Off = defJ0Off, dz = defDz;
    if (Z) {
      const qz = Z[idx];
      if (qz !== 0) { j0Off = Z_j0[qz]; dz = Z_dz[qz]; }
    }

    const base = nH_i0[qn] + j0Off + T_k0[qt];
    const dt = T_dt[qt];
    const dn = nH_dn[qn];

    const c000 = data[base],                      c001 = data[base + 1];
    const c010 = data[base + strideZ],            c011 = data[base + strideZ + 1];
    const c100 = data[base + strideNH],           c101 = data[base + strideNH + 1];
    const c110 = data[base + strideNH + strideZ], c111 = data[base + strideNH + strideZ + 1];

    const c00 = c000 + (c001 - c000) * dt;
    const c01 = c010 + (c011 - c010) * dt;
    const c10 = c100 + (c101 - c100) * dt;
    const c11 = c110 + (c111 - c110) * dt;
    const c0  = c00 + (c01 - c00) * dz;
    const c1  = c10 + (c11 - c10) * dz;
    const logEps = eps_min + (c0 + (c1 - c0) * dn) * epsScale + nH_ex[qn];

    if (logEps <= EPS_MIN) continue;
    const enc = Math.round((logEps - EPS_MIN) * encScale) + 1;
    out[idx] = enc > 255 ? 255 : enc < 1 ? 1 : enc;
  }
  return out;
}

/**
 * Exact physical surface brightness from shifted emissivity integral sum(10^(logEps - EPS_REF) * ds_cm).
 * Returns log10(SB [erg s^-1 cm^-2 arcsec^-2]).
 */
export function surfaceBrightnessLog10(shiftedIntegralCm, z = 0.0) {
  if (!(shiftedIntegralCm > 0)) return -Infinity;
  return EPS_REF + Math.log10(shiftedIntegralCm) - LOG10_4PI_ARCSEC2_PER_SR - 4.0 * Math.log10(1.0 + z);
}
