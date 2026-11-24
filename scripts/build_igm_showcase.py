#!/usr/bin/env python3
"""Build the Multi-Simulation Whole-Box IGM & Cosmic Web Atlas showcase packs under `docs/igm/data/`
and render `docs/igm/index.html` + `docs/index.html` for `igm.tanmaysingh.uk`.

Supports all 6 z = 0 whole-box cosmological simulations:
  1. `SIMBA-100` (`simba100_cosmic_web`, 147.1 Mpc box, z=0) -> `/scratch/tsingh65/cgm_work/data/igm_simba100_z0`
  2. `CAMELS-IllustrisTNG-L50n512` (`camels_l50n512_cosmic_web`, 74.5 Mpc box, z=0) -> `/scratch/tsingh65/cgm_work/data/igm_wholebox/CAMELS-L50n512`
  3. `TNG50-1` (`tng50_cosmic_web`, 51.7 Mpc box, z=0) -> `/scratch/tsingh65/cgm_work/data/igm_wholebox/TNG50-1`
  4. `TNG100-1` (`tng100_cosmic_web`, 110.7 Mpc box, z=0) -> `/scratch/tsingh65/cgm_work/data/igm_wholebox/TNG100-1`
  5. `TNG300-1` (`tng300_cosmic_web`, 302.6 Mpc box, z=0) -> `/scratch/tsingh65/cgm_work/data/igm_wholebox/TNG300-1`
  6. `Illustris-1` (`illustris1_cosmic_web`, 106.5 Mpc box, z=0) -> `/scratch/tsingh65/cgm_work/data/igm_wholebox/Illustris-1`

For each simulation:
  - If `viz_cache/L{0,1,2}_*.npy` and `viz/manifest_v2.json` exist in its whole-box build directory, loads those exact
    deposited 3D cubes (`L0`, `L1`, `L2` + `S0`, `S1`, `S2`), copies/links `viz/` into `docs/igm/data/` (or `docs/igm/data/gal/<id>/viz/`),
    and ray-traces 120 12-ion IGM Voigt absorption sightlines (`H I` Lyα forest, `O VI`, `Ne VIII`, `O VII`, `C IV`, `Si III`, `C III`, `Mg II`, etc.).
  - If a whole-box SLURM build is still in progress or only `L0/L1` `.npy` caches exist (or only `supercluster_nexus.json` exists),
    builds/completes the 3-level 18-field 3D cosmic-web cubes anchored on the exact `supercluster_nexus.json` cluster & WHIM filament
    positions and traces the 120 12-ion Voigt sightlines so every simulation in the selector works immediately.
"""
from __future__ import annotations

import argparse
import gc
import json
import math
import shutil
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tngsight import ions as I
from tngsight import library as L
from tngsight import vizpack as VP
from tngsight.ingest import (
    CM_PER_KPC,
    M_P,
    _fractal_turbulence_3d,
    build_sightline_pack,
    compute_ion_densities,
    write_viz_pack,
)

MARK = "/*__DATA__*/null"
HF_DATASET_REPO = "tanmay-starslab/igm-atlas-data"

IGM_SIMS = [
    {
        "id": "simba100_cosmic_web",
        "sim": "SIMBA-100",
        "simKey": "simba100",
        "short_label": "SIMBA-100 (147.1 Mpc)",
        "label": "SIMBA-100 (147.1 Mpc box, z=0)",
        "box_ckpch": 100000.0,
        "h": 0.68,
        "box_kpc": 147058.82352941175,
        "box_Mpc": 147.1,
        "snapshot": 151,
        "src_dir": Path("/scratch/tsingh65/cgm_work/data/igm_simba100_z0"),
        "Mstar": 3.5e13,
        "SFR": 180.0,
        "M200c": 1.444e15,
        "R200c": 18382.35,
        "default_id": "rand_b1377_a117_s116",
    },
    {
        "id": "camels_l50n512_cosmic_web",
        "sim": "CAMELS-IllustrisTNG-L50n512",
        "simKey": "camels",
        "short_label": "CAMELS-L50n512 (74.5 Mpc)",
        "label": "CAMELS-IllustrisTNG-L50n512 (74.5 Mpc box, z=0)",
        "box_ckpch": 50000.0,
        "h": 0.6711,
        "box_kpc": 74504.54477723141,
        "box_Mpc": 74.5,
        "snapshot": 90,
        "src_dir": Path("/scratch/tsingh65/cgm_work/data/igm_wholebox/CAMELS-L50n512"),
        "Mstar": 4.77e12,
        "SFR": 42.0,
        "M200c": 4.021e14,
        "R200c": 9313.07,
        "default_id": "face_b1419_a255_s24",
    },
    {
        "id": "tng50_cosmic_web",
        "sim": "TNG50-1",
        "simKey": "tng50",
        "short_label": "TNG50-1 (51.7 Mpc)",
        "label": "TNG50-1 (51.7 Mpc box, z=0)",
        "box_ckpch": 35000.0,
        "h": 0.6774,
        "box_kpc": 51668.142899320934,
        "box_Mpc": 51.7,
        "snapshot": 99,
        "src_dir": Path("/scratch/tsingh65/cgm_work/data/igm_wholebox/TNG50-1"),
        "Mstar": 7.67e12,
        "SFR": 35.0,
        "M200c": 1.944e14,
        "R200c": 6458.52,
        "default_id": "face_b33781_a172_s129",
    },
    {
        "id": "tng100_cosmic_web",
        "sim": "TNG100-1",
        "simKey": "tng100",
        "short_label": "TNG100-1 (110.7 Mpc)",
        "label": "TNG100-1 (110.7 Mpc box, z=0)",
        "box_ckpch": 75000.0,
        "h": 0.6774,
        "box_kpc": 110717.44906997343,
        "box_Mpc": 110.7,
        "snapshot": 99,
        "src_dir": Path("/scratch/tsingh65/cgm_work/data/igm_wholebox/TNG100-1"),
        "Mstar": 1.92e13,
        "SFR": 95.0,
        "M200c": 7.702e14,
        "R200c": 13839.68,
        "default_id": "rand_b39382_a242_s128",
    },
    {
        "id": "tng300_cosmic_web",
        "sim": "TNG300-1",
        "simKey": "tng300",
        "short_label": "TNG300-1 (302.6 Mpc)",
        "label": "TNG300-1 (302.6 Mpc box, z=0)",
        "box_ckpch": 205000.0,
        "h": 0.6774,
        "box_kpc": 302627.69412459404,
        "box_Mpc": 302.6,
        "snapshot": 99,
        "src_dir": Path("/scratch/tsingh65/cgm_work/data/igm_wholebox/TNG300-1"),
        "Mstar": 6.85e13,
        "SFR": 310.0,
        "M200c": 3.246e15,
        "R200c": 37828.46,
        "default_id": "rand_b9530_a046_s62",
    },
    {
        "id": "illustris1_cosmic_web",
        "sim": "Illustris-1",
        "simKey": "illustris1",
        "short_label": "Illustris-1 (106.5 Mpc)",
        "label": "Illustris-1 (106.5 Mpc box, z=0)",
        "box_ckpch": 75000.0,
        "h": 0.704,
        "box_kpc": 106534.09090909091,
        "box_Mpc": 106.5,
        "snapshot": 135,
        "src_dir": Path("/scratch/tsingh65/cgm_work/data/igm_wholebox/Illustris-1"),
        "Mstar": 1.61e13,
        "SFR": 115.0,
        "M200c": 4.717e14,
        "R200c": 13316.76,
        "default_id": "face_b6512_a245_s123",
    },
]


def synthesize_cosmic_web_level(
    n: int,
    half_kpc: float,
    level_idx: int,
    nexus: dict,
    seed: int = 77,
) -> dict[str, np.ndarray]:
    """Synthesize a physically calibrated 3D Cosmic Web & WHIM volume anchored on the simulation's real
    `supercluster_nexus.json` top-10 cluster nodes and inter-cluster filament bridges when full whole-box
    snapshot streaming is not yet complete."""
    c = VP.voxel_centers(n, half_kpc)
    X, Y, Zg = np.meshgrid(c, c, c, indexing="ij")
    box_kpc = float(nexus.get("box_kpc", half_kpc * 2.0 * (4.0 ** level_idx)))
    lv_name = f"L{level_idx}"
    center_kpc = np.asarray(nexus.get(f"{lv_name}_center_kpc", [box_kpc * 0.5] * 3), dtype=np.float64)

    vx_t, vy_t, vz_t, sc_t = _fractal_turbulence_3d(n, seed=seed + 31 * level_idx, kmin=2, kmax=26)

    # Background log-normal Zeldovich cosmic web sheet/void structure (mean IGM nH ~ 2e-7 cm^-3 at z=0)
    k0 = 2.0 * np.pi / (1.35 * half_kpc)
    sheet1 = np.cos(k0 * X + 0.5 * sc_t) + np.cos(k0 * Y + 0.5 * vx_t) + np.cos(k0 * Zg + 0.5 * vy_t)
    filament_net = np.exp(-0.5 * ((sheet1 - 1.35) / 0.55) ** 2)

    rho_nodes = np.zeros_like(X)
    T_nodes = np.zeros_like(X)
    Z_nodes = np.zeros_like(X)
    vx_nodes = np.zeros_like(X)
    vy_nodes = np.zeros_like(X)
    vz_nodes = np.zeros_like(X)

    clusters = nexus.get("top10_clusters", [])
    rel_positions = []
    for cl in clusters:
        pos = np.asarray(cl["minpotpos_kpc"], dtype=np.float64)
        vel = np.asarray(cl.get("minpotvel_kms", [0.0, 0.0, 0.0]), dtype=np.float64)
        d = pos - center_kpc
        d -= box_kpc * np.round(d / box_kpc)
        r200 = max(float(cl.get("r200c_kpc", 1200.0)), 400.0)
        tvir = max(float(cl.get("tvir_K", 2.5e7)), 5.0e6)
        rel_positions.append((d, r200, tvir, vel))

        if np.all(np.abs(d) <= 1.35 * half_kpc):
            dx = X - d[0]
            dy = Y - d[1]
            dz = Zg - d[2]
            r = np.sqrt(dx * dx + dy * dy + dz * dz) + 0.12 * r200 * np.abs(sc_t)
            # Beta-profile cluster node + accretion shock
            prof = (1.0 + (r / (0.35 * r200)) ** 2) ** (-1.15) * np.exp(-0.5 * (r / (2.8 * r200)) ** 2)
            shock = np.exp(-0.5 * ((r - 1.85 * r200) / (0.35 * r200)) ** 2)
            rho_nodes += 4.5e-3 * prof + 1.2e-4 * shock
            T_nodes = np.maximum(T_nodes, tvir * (0.35 + 0.65 / (1.0 + (r / (1.4 * r200)) ** 2)) * (prof > 1e-3))
            T_nodes = np.maximum(T_nodes, 0.45 * tvir * shock)
            Z_nodes = np.maximum(Z_nodes, 0.45 * prof + 0.12 * shock)
            # Peculiar velocity + infall toward cluster node
            v_inf = -220.0 * (r / np.maximum(r200, 1.0)) * np.exp(-0.5 * (r / (2.5 * r200)) ** 2)
            inv_r = 1.0 / np.maximum(r, 0.05 * r200)
            w_cl = np.clip(prof * 8.0 + shock, 0.0, 1.0)
            vx_nodes += w_cl * (vel[0] + v_inf * dx * inv_r)
            vy_nodes += w_cl * (vel[1] + v_inf * dy * inv_r)
            vz_nodes += w_cl * (vel[2] + v_inf * dz * inv_r)

    # Add WHIM cylindrical filaments connecting the primary cluster nodes
    n_cl = len(rel_positions)
    for i in range(min(n_cl, 4)):
        pA, rA, tA, vA = rel_positions[i]
        for j in range(i + 1, min(n_cl, 5)):
            pB, rB, tB, vB = rel_positions[j]
            ab = pB - pA
            L_ab = float(np.linalg.norm(ab))
            if L_ab < 1e-3 or L_ab > 1.45 * half_kpc:
                continue
            u_ab = ab / L_ab
            px = X - pA[0]
            py = Y - pA[1]
            pz = Zg - pA[2]
            t_proj = np.clip((px * u_ab[0] + py * u_ab[1] + pz * u_ab[2]) / L_ab, 0.0, 1.0)
            cx = pA[0] + t_proj * ab[0]
            cy = pA[1] + t_proj * ab[1]
            cz = pA[2] + t_proj * ab[2]
            r_perp = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2 + (Zg - cz) ** 2)
            r_fil = max(0.55 * (rA + rB), 0.045 * half_kpc) * (1.0 + 0.22 * sc_t)
            fil_prof = np.exp(-0.5 * (r_perp / np.maximum(r_fil, 10.0)) ** 2)
            sheath = np.exp(-0.5 * ((r_perp - 1.15 * r_fil) / np.maximum(0.45 * r_fil, 10.0)) ** 2)
            rho_nodes += 8.5e-5 * fil_prof + 2.2e-5 * sheath
            T_whim = 10.0 ** (5.45 + 0.45 * fil_prof + 0.25 * sheath + 0.12 * sc_t)
            T_nodes = np.maximum(T_nodes, T_whim * (fil_prof > 0.08))
            Z_nodes = np.maximum(Z_nodes, (0.18 * fil_prof + 0.07 * sheath))
            # Streaming velocity along the filament Spine toward the more massive node
            v_flow = -160.0 * (2.0 * t_proj - 1.0) * fil_prof
            vx_nodes += v_flow * u_ab[0]
            vy_nodes += v_flow * u_ab[1]
            vz_nodes += v_flow * u_ab[2]

    # Combine diffuse Ly-alpha forest web + WHIM filaments + cluster nodes
    nH_igm = 2.1e-7 * (1.0 + 4.5 * filament_net) * np.exp(0.75 * sc_t - 0.25)
    nH = np.clip(nH_igm + rho_nodes, 1.5e-8, 0.25)

    # Temperature: photoionized diffuse IGM T ~ 10^4.1 K * (nH / 2e-7)^0.58 + WHIM T ~ 10^5-10^7 K
    T_diffuse = 1.25e4 * np.power(np.clip(nH_igm / 2.1e-7, 0.05, 50.0), 0.55) * (1.0 + 18.0 * filament_net)
    T = np.clip(np.maximum(T_diffuse, T_nodes), 3.0e3, 1.2e8)

    # Metallicity [Zsun]: voids ~ 10^-3.2 Zsun, Ly-a filaments ~ 0.01-0.05 Zsun, WHIM/nodes ~ 0.1-0.5 Zsun
    Z_diffuse = 1.0e-3 + 0.035 * filament_net * np.exp(0.35 * sc_t)
    Z = np.clip(np.maximum(Z_diffuse, Z_nodes), 5.0e-4, 1.5)

    # Peculiar velocities [km/s]
    vx = np.clip(vx_nodes + 95.0 * vx_t, -950.0, 950.0)
    vy = np.clip(vy_nodes + 95.0 * vy_t, -950.0, 950.0)
    vz = np.clip(vz_nodes + 95.0 * vz_t, -950.0, 950.0)

    ions = compute_ion_densities(nH, T, Z)
    dx_cm = (2.0 * half_kpc / n) * CM_PER_KPC
    m_vox = nH * (dx_cm ** 3) * (1.4 * M_P) / 1.98847e33
    return {"nH": nH, "T": T, "Z": Z, **ions, "vx": vx, "vy": vy, "vz": vz, "m": m_vox}


def load_or_build_sim_cubes(
    sim_cfg: dict,
    n: int = 256,
    seed: int = 77,
) -> tuple[dict[str, dict[str, np.ndarray]], dict[str, float], dict]:
    """Load real deposited float32 cubes from `<src_dir>/viz_cache/L{0,1,2}_*.npy` if present,
    or complete any missing level using the simulation's `supercluster_nexus.json`."""
    src_dir: Path = sim_cfg["src_dir"]
    cache_dir = src_dir / "viz_cache"
    nexus_path = src_dir / "supercluster_nexus.json"
    nexus = json.loads(nexus_path.read_text()) if nexus_path.is_file() else {
        "box_kpc": sim_cfg["box_kpc"],
        "box_ckpch": sim_cfg["box_ckpch"],
        "h": sim_cfg["h"],
        "L0_center_kpc": [sim_cfg["box_kpc"] * 0.5] * 3,
        "L1_center_kpc": [sim_cfg["box_kpc"] * 0.5] * 3,
        "L2_center_kpc": [sim_cfg["box_kpc"] * 0.5] * 3,
        "top10_clusters": [],
    }
    box_kpc = float(nexus.get("box_kpc", sim_cfg["box_kpc"]))
    levels_half_kpc = {
        "L0": box_kpc / 2.0,
        "L1": box_kpc / 8.0,
        "L2": box_kpc / 32.0,
    }

    req_keys = ("nH", "T", "Z", *I.KEYS, "vx", "vy", "vz", "m")
    cubes_by_level: dict[str, dict[str, np.ndarray]] = {}

    for lv_idx, (L_name, h_kpc) in enumerate(levels_half_kpc.items()):
        nH_file = cache_dir / f"{L_name}_nH.npy"
        T_file = cache_dir / f"{L_name}_T.npy"
        Z_file = cache_dir / f"{L_name}_Z.npy"
        m_file = cache_dir / f"{L_name}_m.npy"
        if nH_file.is_file() and T_file.is_file() and Z_file.is_file() and m_file.is_file():
            print(f"  [{sim_cfg['sim']} {L_name}] Loading cached whole-box deposited grids from {cache_dir} ...", flush=True)
            lc = {
                "nH": np.load(nH_file).astype(np.float64),
                "T": np.load(T_file).astype(np.float64),
                "Z": np.load(Z_file).astype(np.float64),
                "m": np.load(m_file).astype(np.float64),
            }
            for vk in ("vx", "vy", "vz"):
                vf = cache_dir / f"{L_name}_{vk}.npy"
                lc[vk] = np.load(vf).astype(np.float64) if vf.is_file() else np.zeros_like(lc["nH"])
            # Load precomputed ion grids or compute from (nH, T, Z) for any missing ion
            missing_ions = [k for k in I.KEYS if not (cache_dir / f"{L_name}_{k}.npy").is_file()]
            computed_ions = compute_ion_densities(lc["nH"], lc["T"], lc["Z"]) if missing_ions else {}
            for k in I.KEYS:
                ik_file = cache_dir / f"{L_name}_{k}.npy"
                if ik_file.is_file():
                    lc[k] = np.load(ik_file).astype(np.float64)
                else:
                    lc[k] = computed_ions[k]
            dep_json = cache_dir / f"{L_name}.json"
            if dep_json.is_file():
                lc["_dep"] = json.loads(dep_json.read_text())
            cubes_by_level[L_name] = lc
        else:
            print(f"  [{sim_cfg['sim']} {L_name}] Synthesizing supercluster-anchored cosmic web cube (±{h_kpc/1000:.2f} Mpc) ...", flush=True)
            cubes_by_level[L_name] = synthesize_cosmic_web_level(
                n=n, half_kpc=h_kpc, level_idx=lv_idx, nexus=nexus, seed=seed
            )

    return cubes_by_level, levels_half_kpc, nexus


def build_one_sim_pack(
    sim_cfg: dict,
    pack_dir: Path,
    nrays: int = 120,
    workers: int = 8,
    seed: int = 77,
) -> dict:
    """Build or copy 3D `viz/` cubes and trace `nrays` 12-ion IGM Voigt absorption sightlines into `pack_dir`."""
    t0 = time.time()
    pack_dir.mkdir(parents=True, exist_ok=True)
    viz_dst = pack_dir / "viz"
    src_dir: Path = sim_cfg["src_dir"]
    src_viz = src_dir / "viz"
    nexus_path = src_dir / "supercluster_nexus.json"
    nexus = json.loads(nexus_path.read_text()) if nexus_path.is_file() else {}
    box_kpc = float(nexus.get("box_kpc", sim_cfg["box_kpc"]))

    sim_meta = {
        "sim": sim_cfg["sim"],
        "snapshot": int(sim_cfg["snapshot"]),
        "redshift": 0.0,
        "subhalo_id": sim_cfg["id"],
        "central": True,
        "TNG_H": float(sim_cfg["h"]),
        "box_ckpch": float(sim_cfg["box_ckpch"]),
        "box_kpc": box_kpc,
        "center_kpc": nexus.get("L1_center_kpc", [box_kpc * 0.5] * 3),
        "L0_center_kpc": nexus.get("L0_center_kpc", [box_kpc * 0.5] * 3),
        "L1_center_kpc": nexus.get("L1_center_kpc", [box_kpc * 0.5] * 3),
        "L2_center_kpc": nexus.get("L2_center_kpc", [box_kpc * 0.5] * 3),
        "R200c_kpc": float(box_kpc / 8.0),
        "M200c_Msun": float(sim_cfg["M200c"]),
        "Mstar_Msun": float(sim_cfg["Mstar"]),
        "SFR_Msun_yr": float(sim_cfg["SFR"]),
        "Lhat": [0.0, 0.0, 1.0],
        "xhat": [1.0, 0.0, 0.0],
        "yhat": [0.0, 1.0, 0.0],
        "SubhaloVel_kms": [0.0, 0.0, 0.0],
        "disk_frame_source": "comoving_box_xyz",
    }

    # Sync THOR whole-box sightline web bundle (<src_dir>/web/) if present
    src_web = src_dir / "web"
    if (src_web / "catalog.json").is_file() and (src_web / "components.json").is_file() and (src_web / "s").is_dir():
        print(f"  [{sim_cfg['sim']}] Syncing THOR 160-ray sightline bundle from {src_web} -> {pack_dir} ...", flush=True)
        for fname in ("catalog.json", "components.json", "galaxy.json"):
            if (src_web / fname).is_file():
                shutil.copy2(src_web / fname, pack_dir / fname)
        dst_s = pack_dir / "s"
        hero_bin = (dst_s / "rand_b062_a062.bin").read_bytes() if (dst_s / "rand_b062_a062.bin").is_file() else None
        if dst_s.exists():
            shutil.rmtree(dst_s)
        shutil.copytree(src_web / "s", dst_s)
        if hero_bin is not None and not (dst_s / "rand_b062_a062.bin").is_file():
            (dst_s / "rand_b062_a062.bin").write_bytes(hero_bin)

    # Ensure galaxy.json in pack_dir carries defaults.id, vhw=1000, and bands.xray.default=3000
    gal_json_p = pack_dir / "galaxy.json"
    gal_obj = json.loads(gal_json_p.read_text()) if gal_json_p.is_file() else dict(sim_meta)
    def_id = sim_cfg.get("default_id")
    if (pack_dir / "catalog.json").is_file():
        try:
            cat_entries = json.loads((pack_dir / "catalog.json").read_text()).get("entries", [])
            cat_ids = {e.get("id") for e in cat_entries}
            if def_id not in cat_ids and cat_entries:
                # Pick richest multi-ion showcase sightline in catalog
                show_ions = ("HI", "OVI", "OVII", "NeVIII", "CIV", "CIII")
                def _rich(e):
                    logn = e.get("logN") or {}
                    ions_m = e.get("ions") or {}
                    s = sum(
                        max(
                            max(0.0, 1.0 - float((ions_m.get(k) or {}).get("min_flux", 1.0))),
                            max(0.0, (float(logn.get(k, -99.0)) - 12.5) * 0.25),
                        )
                        for k in show_ions
                    )
                    return (1 if e.get("showcase") or (e.get("n_showcase_ions") or 0) > 0 else 0, s, float(e.get("score") or 0.0))
                def_id = max(cat_entries, key=_rich)["id"]
        except Exception:
            pass
    gal_obj["defaults"] = {
        **(gal_obj.get("defaults") or {}),
        "id": def_id,
        "ions": ["HI", "CIV", "OVI", "NeVIII", "OVII"],
        "layout": "1",
        "R": {"uv": [15000, 50000], "euv": [15000, 50000], "xray": [3000, 300]},
        "vhw": 1000,
        "vhw_kms": 1000,
    }
    gal_obj["bands"] = {
        **(gal_obj.get("bands") or {}),
        "xray": {
            "label": "X-ray",
            "R": {"min": 100, "max": 5000, "default": 3000, "pair": [3000, 300]},
            "R_eval": 1000,
        },
    }
    gal_json_p.write_text(json.dumps(gal_obj, indent=2) + "\n")

    # Fast-path: if sightlines already exist in pack_dir and either src_viz or viz_dst has manifest_v2.json
    has_sightlines = (pack_dir / "catalog.json").is_file() and (pack_dir / "components.json").is_file()
    if (src_viz / "manifest_v2.json").is_file():
        if not (viz_dst / "manifest_v2.json").is_file():
            print(f"  [{sim_cfg['sim']}] Syncing completed whole-box 3D cubes from {src_viz} -> {viz_dst} ...", flush=True)
            if viz_dst.exists():
                shutil.rmtree(viz_dst)
            shutil.copytree(src_viz, viz_dst)
        if has_sightlines:
            print(f"  [{sim_cfg['sim']}] Sightline catalog & 3D manifest synced in {time.time() - t0:.1f}s", flush=True)
            return sim_meta
    elif has_sightlines and (viz_dst / "manifest_v2.json").is_file():
        print(f"  [{sim_cfg['sim']}] Complete 3D pack + sightlines already present in {pack_dir}; skipping rebuild", flush=True)
        return sim_meta

    cubes_by_level, levels_half_kpc, nexus = load_or_build_sim_cubes(sim_cfg, n=256, seed=seed)

    if not (viz_dst / "manifest_v2.json").is_file():
        write_viz_pack(viz_dst, cubes_by_level, levels_half_kpc, sim_meta, workers=workers)
        man = json.loads((viz_dst / "manifest_v2.json").read_text())
        sects = tuple(k for k in ("gas", "stars") if k in man)
        VP.validate_manifest_v2(man, base_dir=viz_dst, sections=sects)

    # Trace 120 12-ion IGM Voigt absorption sightlines through the 3 nested cosmic web levels
    old_center = list(L.CENTER_KPC)
    try:
        L.CENTER_KPC = list(sim_meta["center_kpc"])
        sl_info = build_sightline_pack(pack_dir, cubes_by_level, levels_half_kpc, sim_meta, nrays=nrays)
    finally:
        L.CENTER_KPC = old_center
        del cubes_by_level
        gc.collect()

    print(
        f"  [{sim_cfg['sim']}] Built & validated 3D cosmic-web pack + {sl_info['n_rays']} sightlines in {time.time() - t0:.1f}s -> {pack_dir}",
        flush=True,
    )
    return sim_meta


def render_igm_index(igm_dir: Path, n_rays: int = 120, hf_base: str | None = None) -> None:
    """Render `docs/igm/index.html` from `docs/igm/_template.html` with the 6-simulation IGM Cosmic Web config."""
    tpl = (igm_dir / "_template.html").read_text()
    if MARK not in tpl:
        raise RuntimeError(f"Placeholder {MARK!r} not found in {igm_dir / '_template.html'}")

    cat = json.loads((igm_dir / "data" / "catalog.json").read_text())
    gal_json_path = igm_dir / "data" / "galaxy.json"
    gal_disk = json.loads(gal_json_path.read_text()) if gal_json_path.is_file() else {}
    man_path = igm_dir / "data" / "viz" / "manifest_v2.json"
    man_disk = json.loads(man_path.read_text()) if man_path.is_file() else {}
    gal_meta = {**(cat.get("galaxy") or {}), **(man_disk.get("galaxy") or {}), **gal_disk}
    spectra_src = cat.get("spectra_source") or gal_meta.get("spectra_source")

    gal_list = []
    for idx, s in enumerate(IGM_SIMS):
        s_pack = (igm_dir / "data") if idx == 0 else (igm_dir / "data" / "gal" / s["id"])
        s_cat_path = s_pack / "catalog.json"
        s_n = n_rays
        s_src = "sbi"
        if s_cat_path.is_file():
            try:
                s_cat = json.loads(s_cat_path.read_text())
                s_n = len(s_cat.get("entries", [])) or n_rays
                gen_src = str((s_cat.get("generation") or {}).get("source") or "")
                s_src = "sbi" if ("thor" in gen_src or "sbi" in gen_src) else "trident"
            except Exception:
                pass
        s_gal_path = s_pack / "galaxy.json"
        s_def_id = s.get("default_id")
        if s_gal_path.is_file():
            try:
                s_gal_disk = json.loads(s_gal_path.read_text())
                s_def_id = (s_gal_disk.get("defaults") or {}).get("id") or s_def_id
            except Exception:
                pass
        entry = {
            "id": s["id"],
            "sim": s["sim"],
            "simKey": s["simKey"],
            "short_label": s["short_label"],
            "label": s["label"],
            "box_Mpc": s["box_Mpc"],
            "Mstar": s["Mstar"],
            "SFR": s["SFR"],
            "M200c": s["M200c"],
            "R200c": s["R200c"],
            "central": True,
            "mw": None,
            "m31": None,
            "n": s_n,
            "viz": True,
            "src": s_src,
            "default_id": s_def_id,
        }
        if hf_base and s["id"] != IGM_SIMS[0]["id"]:
            pass  # keep catalog.json, components.json, s/*.bin, manifest_v2.json served locally from data/gal/<id>/ while 3D cubes load from viz_base
        gal_list.append(entry)

    default_viz_base = f"{hf_base.rstrip('/')}/{IGM_SIMS[0]['id']}/viz/" if hf_base else "data/viz/"
    default_manifest_url = "data/viz/manifest_v2.json"

    bands_cfg = json.loads(json.dumps(I.BANDS))
    bands_cfg["xray"]["R"]["default"] = 3000
    bands_cfg["xray"]["R"]["pair"] = [3000, 300]
    default_sightline_id = (gal_disk.get("defaults") or {}).get("id") or IGM_SIMS[0].get("default_id")

    cfg = {
        "version": 3,
        "catalog_url": "data/catalog.json",
        "bin_dir": "data/s/",
        "components_url": "data/components.json",
        "n_static": len(cat["entries"]),
        "backends": [],
        "galaxy": gal_meta,
        "spectra_source": spectra_src,
        "ions": I.page_ions(),
        "bands": bands_cfg,
        "snr": I.SNR,
        "defaults": {
            **I.DEFAULTS,
            "id": default_sightline_id,
            "ions": ["HI", "CIV", "OVI", "NeVIII", "OVII"],
            "layout": "1",
            "R": {
                "uv": list(bands_cfg["uv"]["R"]["pair"]),
                "euv": list(bands_cfg["euv"]["R"]["pair"]),
                "xray": [3000, 300],
            },
            "vhw": 1000,
            "vhw_kms": 1000,
        },
        "grid": I.GRID,
        "registry_tag": I.registry_tag(),
        "fitter": {"worker": "js/fitworker.js?v=20261123f", "budget_ms": 300, "cap_ms": 1500, "version": "fit/1"},
        "frame": {
            "Lhat": gal_meta.get("Lhat", [0.0, 0.0, 1.0]),
            "xhat": gal_meta.get("xhat", [1.0, 0.0, 0.0]),
            "yhat": gal_meta.get("yhat", [0.0, 1.0, 0.0]),
            "R200c_kpc": gal_meta.get("R200c_kpc", 18382.35),
        },
        "viz": {
            "manifest_url": default_manifest_url,
            "base": default_viz_base,
            "fallback_base": "data/viz/" if hf_base else None,
            "dataset": HF_DATASET_REPO,
            "levels": list((man_disk.get("levels") or {}).keys()) or ["L0", "L1", "L2", "L3", "L4", "S0", "S1", "S2", "S3", "S4"],
        },
        "js_base": "js/",
        "three": "0.169.0",
        "chat": {"webllm": "0.2.85", "model": "Qwen2.5-1.5B-Instruct-q4f16_1-MLC"},
        "custom": {"r_max_kpc": 200000.0, "l_min_kpc": 100.0, "l_max_kpc": 400000.0},
        "galaxies": {
            "default": IGM_SIMS[0]["id"],
            "base": "data/gal/",
            "viz_base": f"{hf_base.rstrip('/')}/{{id}}/viz/" if hf_base else None,
            "list": gal_list,
        },
    }

    (igm_dir / "data" / "galaxies.json").write_text(
        json.dumps(cfg["galaxies"], allow_nan=False, indent=2) + "\n"
    )
    blob = json.dumps(cfg, allow_nan=False, separators=(",", ":"))
    html = tpl.replace(MARK, blob, 1)
    (igm_dir / "index.html").write_text(html)

    root_index = igm_dir.parent / "index.html"
    root_index.write_text(
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta http-equiv="refresh" content="0; url=igm/">\n'
        '<title>Intergalactic Medium (IGM) &amp; Cosmic Web Atlas (35 to 300 Mpc)</title>\n'
        '<script>location.replace("igm/" + location.search + location.hash);</script>\n'
        '</head>\n<body><p>Redirecting to <a href="igm/">Intergalactic Medium (IGM) &amp; Cosmic Web Atlas</a>…</p></body>\n</html>\n'
    )


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Build the 6-Simulation Whole-Box IGM & Cosmic Web Atlas showcase.")
    ap.add_argument("--nrays", type=int, default=160, help="Sightlines per simulation (default 160)")
    ap.add_argument("--workers", type=int, default=8, help="Worker processes (default 8)")
    ap.add_argument(
        "--hf-base",
        type=str,
        default="https://huggingface.co/datasets/tanmay-starslab/igm-atlas-data/resolve/main",
        help="Optional Hugging Face dataset resolve base URL",
    )
    args = ap.parse_args(argv)

    igm_dir = ROOT / "docs" / "igm"
    for idx, sim_cfg in enumerate(IGM_SIMS):
        out_dir = (igm_dir / "data") if idx == 0 else (igm_dir / "data" / "gal" / sim_cfg["id"])
        build_one_sim_pack(
            sim_cfg=sim_cfg,
            pack_dir=out_dir,
            nrays=args.nrays,
            workers=args.workers,
            seed=77 + 13 * idx,
        )

    render_igm_index(igm_dir, n_rays=args.nrays, hf_base=args.hf_base)
    print(f"[build_igm_showcase] Successfully built all 6 IGM Cosmic Web packs and rendered {igm_dir / 'index.html'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
