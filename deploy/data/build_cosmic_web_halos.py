#!/usr/bin/env python3
"""Build the 3D Cosmic Web embedded galaxy & cluster catalogue (`docs/igm/data/cosmic_web_halos.json`)
for `igm.tanmaysingh.uk` (`tanmay-starslab/igm-atlas`).

Reads:
  1. Each whole-box IGM simulation's `galaxy.json` in
     `/scratch/tsingh65/cgm_work/data/igm_wholebox/{SIMBA-100,CAMELS-L50n512,TNG50-1,TNG100-1,TNG300-1,Illustris-1}/galaxy.json`
     (`center_kpc`, `box_kpc`, `Lhat`, `xhat`, `yhat`) and transforms each halo's comoving box coordinates `x_halo`
     with periodic wrapping into the IGM 3D viewer's frame:
         pos_igm_kpc = ((x_halo - x_igm + box/2) % box - box/2) @ R_igm.T
  2. The 313 hosted 5-level (400 kpc -> 12 pc / 4 Mpc -> 15 kpc) galaxies and clusters belonging to those boxes:
     - `TNG50-1` (`tng50_cosmic_web`): 198 TNG50-1 galaxies (`/scratch/tsingh65/cgm_work/data/gal/*/galaxy.json`
       + shard map from `/scratch/tsingh65/cgm_work/scratch/hfpolish/docs/tng50/index.html`) + `top10_clusters`
     - `TNG100-1` (`tng100_cosmic_web`): 30 TNG100-1 galaxies (`/scratch/tsingh65/cgm_work/data/tng100_z0/tng100_sub*/galaxy.json`,
       hosted on `tanmay-starslab/tng-illustris-z0-web-0`) + `top10_clusters`
     - `TNG300-1` (`tng300_cosmic_web`): 20 TNG300-1 galaxies (`/scratch/tsingh65/cgm_work/data/tng300_z0/tng300_sub*/galaxy.json`,
       hosted on `tanmay-starslab/tng-illustris-z0-web-0`) + 20 TNG300-1 clusters (`tanmay-starslab/icm-atlas-3d-0`,
       linking to `https://icm.tanmaysingh.uk/?g=<id>#tab=3d`, including `top10_clusters`)
     - `Illustris-1` (`illustris1_cosmic_web`): 20 Illustris-1 galaxies (`/scratch/tsingh65/cgm_work/data/illustris1_z0/illustris1_sub*/galaxy.json`,
       hosted on `tanmay-starslab/tng-illustris-z0-web-0`) + `top10_clusters`
     - `SIMBA-100` (`simba100_cosmic_web`): 15 SIMBA-100 galaxies (`/scratch/tsingh65/cgm_work/data/simba_gal/simba100_g*/galaxy.json`,
       hosted on `tanmay-starslab/simba-z0-web-0`) + 10 SIMBA-100 clusters (`/scratch/tsingh65/cgm_work/data/icm_clusters/simba100_c*/galaxy.json`,
       hosted on `tanmay-starslab/icm-atlas-3d-0`, matching `top10_clusters`)
     - `CAMELS-L50n512` (`camels_l50n512_cosmic_web`): `top10_clusters` from `supercluster_nexus` + 4 CAMELS-IllustrisTNG
       galaxies (`/scratch/tsingh65/cgm_work/data/public_sims/cutouts/camels_tng_mw*/galaxy.json`, hosted on `tanmay-starslab/public-sims-web-0`)

Outputs `/scratch/tsingh65/igm-atlas/docs/igm/data/cosmic_web_halos.json`.
"""
from __future__ import annotations

import glob
import json
import math
import os
import re
from pathlib import Path
from typing import Any

import h5py
import numpy as np

REPO_ROOT = Path("/scratch/tsingh65/igm-atlas")
OUT_PATH = REPO_ROOT / "docs" / "igm" / "data" / "cosmic_web_halos.json"

WHOLEBOX_ROOT = Path("/scratch/tsingh65/cgm_work/data/igm_wholebox")
TNG50_GAL_ROOT = Path("/scratch/tsingh65/cgm_work/data/gal")
HFPOLISH_INDEX = Path("/scratch/tsingh65/cgm_work/scratch/hfpolish/docs/tng50/index.html")
TNG100_ROOT = Path("/scratch/tsingh65/cgm_work/data/tng100_z0")
TNG300_ROOT = Path("/scratch/tsingh65/cgm_work/data/tng300_z0")
ILLUSTRIS1_ROOT = Path("/scratch/tsingh65/cgm_work/data/illustris1_z0")
SIMBA_GAL_ROOT = Path("/scratch/tsingh65/cgm_work/data/simba_gal")
SIMBA_ALT_ROOT = Path("/scratch/tsingh65/cgm_work/data/simba_z0/cutouts")
ICM_CLUSTERS_ROOT = Path("/scratch/tsingh65/cgm_work/data/icm_clusters")
PUBLIC_SIMS_ROOT = Path("/scratch/tsingh65/cgm_work/data/public_sims/cutouts")

BOX_MAP = [
    ("simba100_cosmic_web", "SIMBA-100"),
    ("tng50_cosmic_web", "TNG50-1"),
    ("tng100_cosmic_web", "TNG100-1"),
    ("tng300_cosmic_web", "TNG300-1"),
    ("illustris1_cosmic_web", "Illustris-1"),
    ("camels_l50n512_cosmic_web", "CAMELS-L50n512"),
]

# Representative hosted 5-level ICM cluster packs on tanmay-starslab/icm-atlas-3d-0 for non-SIMBA/TNG300 top10_clusters
HOSTED_ICM_REFS = [
    ("tngc_h14258311", 14.85),
    ("tngc_h14300805", 14.72),
    ("tngc_h14346919", 14.64),
    ("tngc_h14397702", 14.58),
    ("tngc_h14441698", 14.52),
    ("tngc_h14486018", 14.48),
    ("tngc_h14528100", 14.42),
    ("tngc_h14579813", 14.36),
    ("tngc_h14859514", 14.30),
    ("tngc_h15543062", 14.20),
]


def safe_log10(val: float | None, default: float = 0.0) -> float:
    if val is None or not ( float(val) > 0.0 ):
        return round(default, 2)
    return round(math.log10(float(val)), 2)


def transform_pos_kpc(x_halo: list[float] | np.ndarray, igm_meta: dict[str, Any]) -> list[float]:
    """Transform comoving box coordinates `x_halo` [kpc] into the IGM 3D viewer's disk/box frame:
    pos_igm_kpc = ((x_halo - x_igm + box/2) % box - box/2) @ R_igm.T
    """
    box = float(igm_meta["box_kpc"])
    x_igm = np.asarray(igm_meta["center_kpc"], dtype=np.float64)
    xh = np.asarray(x_halo, dtype=np.float64)
    xhat = np.asarray(igm_meta.get("xhat", [1.0, 0.0, 0.0]), dtype=np.float64)
    yhat = np.asarray(igm_meta.get("yhat", [0.0, 1.0, 0.0]), dtype=np.float64)
    lhat = np.asarray(igm_meta.get("Lhat", [0.0, 0.0, 1.0]), dtype=np.float64)
    R_igm = np.vstack([xhat, yhat, lhat])
    pos = ((xh - x_igm + 0.5 * box) % box - 0.5 * box) @ R_igm.T
    return [round(float(v), 2) for v in pos]


def load_tng50_viz_bases() -> dict[str, str]:
    """Read exact Hugging Face shard URLs for the 198 TNG50-1 galaxies from hfpolish/docs/tng50/index.html."""
    out: dict[str, str] = {
        "488530": "https://huggingface.co/datasets/tanmay-starslab/tng50-sub488530-viz/resolve/main/"
    }
    if HFPOLISH_INDEX.is_file():
        txt = HFPOLISH_INDEX.read_text(encoding="utf-8")
        m = re.search(r"const DATA\s*=\s*(\{.*?\});\s*\n", txt)
        if m:
            d = json.loads(m.group(1))
            for g in d.get("galaxies", {}).get("list", []):
                gid = str(g.get("id"))
                base = g.get("base")
                if base and isinstance(base, str):
                    out[gid] = base.rstrip("/") + "/viz/"
    return out


def nearest_icm_ref(log_m200c: float) -> str:
    best_id = HOSTED_ICM_REFS[0][0]
    best_d = 1e9
    for cid, lm in HOSTED_ICM_REFS:
        d = abs(lm - log_m200c)
        if d < best_d:
            best_d = d
            best_id = cid
    return best_id


def build_top10_cluster_entries(
    sim_id: str,
    igm_meta: dict[str, Any],
    existing_cluster_positions: list[np.ndarray] | None = None,
    icm_id_override: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Build cluster entries from `supercluster_nexus.top10_clusters` in `igm_meta`."""
    nexus = igm_meta.get("supercluster_nexus") or {}
    top10 = nexus.get("top10_clusters") or []
    entries: list[dict[str, Any]] = []
    pos_list = existing_cluster_positions or []

    for idx, cl in enumerate(top10):
        pos_raw = cl.get("minpotpos_kpc")
        if not pos_raw or len(pos_raw) != 3:
            continue
        pos_igm = transform_pos_kpc(pos_raw, igm_meta)
        p_vec = np.asarray(pos_igm, dtype=np.float64)
        # Skip if already represented within 50 kpc by an explicit cluster directory (e.g. SIMBA-100 or TNG300-1)
        if any(float(np.linalg.norm(p_vec - q)) < 50.0 for q in pos_list):
            continue
        pos_list.append(p_vec)

        rank = int(cl.get("rank") or (idx + 1))
        m200 = float(cl.get("m200c_msun") or 1e14)
        r200 = float(cl.get("r200c_kpc") or 1000.0)
        mstar = float(cl.get("mstar_total_msun") or cl.get("mstar_bcg_msun") or (m200 * 0.015))
        log_m200 = safe_log10(m200, 14.0)
        log_mstar = safe_log10(mstar, 12.0)

        fof_idx = cl.get("fof_group_index", cl.get("caesar_halo_index", rank - 1))
        icm_id = (
            icm_id_override[idx]
            if icm_id_override and idx < len(icm_id_override)
            else nearest_icm_ref(log_m200)
        )
        prefix = sim_id.replace("_cosmic_web", "")
        cid = f"{prefix}_c{rank:02d}_fof{fof_idx}"
        short_id = f"Cluster #{rank} (FoF {fof_idx})"

        entries.append({
            "id": cid,
            "short_id": short_id,
            "kind": "cluster",
            "pos_kpc": pos_igm,
            "logMstar": log_mstar,
            "logM200c": log_m200,
            "R200c_kpc": round(r200, 1),
            "viz_base": f"https://huggingface.co/datasets/tanmay-starslab/icm-atlas-3d-0/resolve/main/{icm_id}/viz/",
            "portal_url": f"https://icm.tanmaysingh.uk/?g={icm_id}#tab=3d",
        })
    return entries


def build_simba100(igm_meta: dict[str, Any]) -> list[dict[str, Any]]:
    """15 SIMBA-100 galaxies (tanmay-starslab/simba-z0-web-0) + 10 SIMBA-100 clusters (tanmay-starslab/icm-atlas-3d-0)."""
    entries: list[dict[str, Any]] = []
    cluster_positions: list[np.ndarray] = []

    # 10 SIMBA-100 clusters
    for gpath in sorted(ICM_CLUSTERS_ROOT.glob("simba100_c*/galaxy.json")):
        gj = json.loads(gpath.read_text(encoding="utf-8"))
        cid = str(gj.get("subhalo_id") or gpath.parent.name)
        pos_igm = transform_pos_kpc(gj["center_kpc"], igm_meta)
        cluster_positions.append(np.asarray(pos_igm, dtype=np.float64))
        m_rank = re.match(r"^simba100_c(\d+)_h(\d+)$", cid)
        short_id = f"Cluster #{int(m_rank.group(1))} (Halo {m_rank.group(2)})" if m_rank else cid
        entries.append({
            "id": cid,
            "short_id": short_id,
            "kind": "cluster",
            "pos_kpc": pos_igm,
            "logMstar": safe_log10(gj.get("Mstar_Msun"), 12.5),
            "logM200c": safe_log10(gj.get("M200c_Msun"), 14.5),
            "R200c_kpc": round(float(gj.get("R200c_kpc") or 1500.0), 1),
            "viz_base": f"https://huggingface.co/datasets/tanmay-starslab/icm-atlas-3d-0/resolve/main/{cid}/viz/",
            "portal_url": f"https://icm.tanmaysingh.uk/?g={cid}#tab=3d",
        })

    # Any additional top10_clusters not already in the 10 SIMBA-100 clusters
    entries.extend(build_top10_cluster_entries("simba100_cosmic_web", igm_meta, cluster_positions))

    # 15 SIMBA-100 galaxies
    gal_root = SIMBA_ALT_ROOT if SIMBA_ALT_ROOT.is_dir() else SIMBA_GAL_ROOT
    for gpath in sorted(gal_root.glob("simba100_g*/galaxy.json")):
        gj = json.loads(gpath.read_text(encoding="utf-8"))
        gid = str(gj.get("subhalo_id") or gpath.parent.name)
        pos_igm = transform_pos_kpc(gj["center_kpc"], igm_meta)
        m_num = re.match(r"^simba100_g(\d+)$", gid)
        short_id = f"Galaxy #{m_num.group(1)}" if m_num else gid
        entries.append({
            "id": gid,
            "short_id": short_id,
            "kind": "galaxy",
            "pos_kpc": pos_igm,
            "logMstar": safe_log10(gj.get("Mstar_Msun"), 10.8),
            "logM200c": safe_log10(gj.get("M200c_Msun"), 12.2),
            "R200c_kpc": round(float(gj.get("R200c_kpc") or 250.0), 1),
            "viz_base": f"https://huggingface.co/datasets/tanmay-starslab/simba-z0-web-0/resolve/main/{gid}/viz/",
            "portal_url": f"https://galaxies.tanmaysingh.uk/?g={gid}#tab=3d",
        })

    return entries


def build_tng50(igm_meta: dict[str, Any]) -> list[dict[str, Any]]:
    """198 TNG50-1 galaxies + top10_clusters from supercluster_nexus."""
    entries: list[dict[str, Any]] = []
    viz_map = load_tng50_viz_bases()

    # Include top10_clusters of TNG50-1 first
    entries.extend(build_top10_cluster_entries("tng50_cosmic_web", igm_meta))

    # 198 TNG50-1 galaxies
    for gpath in sorted(TNG50_GAL_ROOT.glob("*/galaxy.json"), key=lambda p: int(p.parent.name) if p.parent.name.isdigit() else 0):
        gj = json.loads(gpath.read_text(encoding="utf-8"))
        gid = str(gj.get("subhalo_id") or gpath.parent.name)
        pos_igm = transform_pos_kpc(gj["center_kpc"], igm_meta)
        vbase = viz_map.get(gid, f"https://huggingface.co/datasets/tanmay-starslab/tng50-mwm31-web-0/resolve/main/{gid}/viz/")
        entries.append({
            "id": gid,
            "short_id": f"Subhalo {gid}",
            "kind": "galaxy",
            "pos_kpc": pos_igm,
            "logMstar": safe_log10(gj.get("Mstar_Msun"), 10.8),
            "logM200c": safe_log10(gj.get("M200c_Msun"), 12.2),
            "R200c_kpc": round(float(gj.get("R200c_kpc") or 240.0), 1),
            "viz_base": vbase,
            "portal_url": f"https://galaxies.tanmaysingh.uk/?g={gid}#tab=3d",
        })
    return entries


def build_tng100(igm_meta: dict[str, Any]) -> list[dict[str, Any]]:
    """30 TNG100-1 galaxies (tanmay-starslab/tng-illustris-z0-web-0) + top10_clusters."""
    entries: list[dict[str, Any]] = []
    entries.extend(build_top10_cluster_entries("tng100_cosmic_web", igm_meta))

    for gpath in sorted(TNG100_ROOT.glob("tng100_sub*/galaxy.json")):
        gj = json.loads(gpath.read_text(encoding="utf-8"))
        gid = str(gj.get("subhalo_id") or gpath.parent.name)
        pos_igm = transform_pos_kpc(gj["center_kpc"], igm_meta)
        sub_num = gid.replace("tng100_sub", "")
        entries.append({
            "id": gid,
            "short_id": f"Subhalo {sub_num}",
            "kind": "galaxy",
            "pos_kpc": pos_igm,
            "logMstar": safe_log10(gj.get("Mstar_Msun"), 10.9),
            "logM200c": safe_log10(gj.get("M200c_Msun"), 12.5),
            "R200c_kpc": round(float(gj.get("R200c_kpc") or 300.0), 1),
            "viz_base": f"https://huggingface.co/datasets/tanmay-starslab/tng-illustris-z0-web-0/resolve/main/{gid}/viz/",
            "portal_url": f"https://galaxies.tanmaysingh.uk/?g={gid}#tab=3d",
        })
    return entries


def build_tng300(igm_meta: dict[str, Any]) -> list[dict[str, Any]]:
    """20 TNG300-1 galaxies (tanmay-starslab/tng-illustris-z0-web-0) + 20 TNG300-1 clusters (tanmay-starslab/icm-atlas-3d-0)."""
    entries: list[dict[str, Any]] = []
    gal_dirs = sorted(p.parent for p in TNG300_ROOT.glob("tng300_sub*/galaxy.json"))
    icm_tng300_ids = [d.name for d in gal_dirs]

    # 1. Read the 20 TNG300-1 massive clusters from targets.json + groups_099 (which includes the top10_clusters!)
    targets_path = TNG300_ROOT / "targets.json"
    groups_dir = WHOLEBOX_ROOT / "TNG300-1" / "groups_099"
    cluster_positions: list[np.ndarray] = []

    if targets_path.is_file() and groups_dir.is_dir():
        t20 = json.loads(targets_path.read_text(encoding="utf-8"))
        want = {int(x["id"]): i + 1 for i, x in enumerate(t20)}
        h = float(igm_meta.get("TNG_H") or 0.6774)
        found = []
        grp_idx = 0
        for i in range(40):
            gf = groups_dir / f"fof_subhalo_tab_099.{i}.hdf5"
            if not gf.is_file():
                break
            with h5py.File(gf, "r") as f:
                ng = int(f["Header"].attrs["Ngroups_ThisFile"])
                if ng > 0:
                    g_pos = f["Group/GroupPos"][:] / h
                    g_m200 = f["Group/Group_M_Crit200"][:] * 1e10 / h
                    g_r200 = f["Group/Group_R_Crit200"][:] / h
                    g_first = f["Group/GroupFirstSub"][:]
                    g_mstar = f["Group/GroupMassType"][:, 4] * 1e10 / h
                    for j in range(ng):
                        fs = int(g_first[j])
                        if fs in want:
                            found.append((
                                want[fs],
                                grp_idx + j,
                                fs,
                                g_pos[j].tolist(),
                                float(g_m200[j]),
                                float(g_r200[j]),
                                float(g_mstar[j]),
                            ))
                grp_idx += ng
            if len(found) >= len(want):
                break
        found.sort(key=lambda x: x[0])
        for idx, (rank, fof_id, first_sub, pos_box, m200, r200, mstar) in enumerate(found):
            pos_igm = transform_pos_kpc(pos_box, igm_meta)
            cluster_positions.append(np.asarray(pos_igm, dtype=np.float64))
            icm_id = icm_tng300_ids[idx] if idx < len(icm_tng300_ids) else "tngc_h14258311"
            entries.append({
                "id": icm_id,
                "short_id": f"Cluster #{rank} (FoF {fof_id})",
                "kind": "cluster",
                "pos_kpc": pos_igm,
                "logMstar": safe_log10(mstar, 12.8),
                "logM200c": safe_log10(m200, 14.8),
                "R200c_kpc": round(r200, 1),
                "viz_base": f"https://huggingface.co/datasets/tanmay-starslab/icm-atlas-3d-0/resolve/main/{icm_id}/viz/",
                "portal_url": f"https://icm.tanmaysingh.uk/?g={icm_id}#tab=3d",
            })

    # Ensure any remaining top10_clusters from supercluster_nexus are included
    entries.extend(build_top10_cluster_entries("tng300_cosmic_web", igm_meta, cluster_positions, icm_tng300_ids))

    # 2. The 20 TNG300-1 galaxies on tanmay-starslab/tng-illustris-z0-web-0
    for d in gal_dirs:
        gpath = d / "galaxy.json"
        gj = json.loads(gpath.read_text(encoding="utf-8"))
        gid = str(gj.get("subhalo_id") or d.name)
        pos_igm = transform_pos_kpc(gj["center_kpc"], igm_meta)
        sub_num = gid.replace("tng300_sub", "")
        entries.append({
            "id": gid,
            "short_id": f"Subhalo {sub_num}",
            "kind": "galaxy",
            "pos_kpc": pos_igm,
            "logMstar": safe_log10(gj.get("Mstar_Msun"), 11.1),
            "logM200c": safe_log10(gj.get("M200c_Msun"), 12.7),
            "R200c_kpc": round(float(gj.get("R200c_kpc") or 360.0), 1),
            "viz_base": f"https://huggingface.co/datasets/tanmay-starslab/tng-illustris-z0-web-0/resolve/main/{gid}/viz/",
            "portal_url": f"https://galaxies.tanmaysingh.uk/?g={gid}#tab=3d",
        })

    return entries


def build_illustris1(igm_meta: dict[str, Any]) -> list[dict[str, Any]]:
    """20 Illustris-1 galaxies (tanmay-starslab/tng-illustris-z0-web-0) + top10_clusters."""
    entries: list[dict[str, Any]] = []
    entries.extend(build_top10_cluster_entries("illustris1_cosmic_web", igm_meta))

    for gpath in sorted(ILLUSTRIS1_ROOT.glob("illustris1_sub*/galaxy.json")):
        gj = json.loads(gpath.read_text(encoding="utf-8"))
        gid = str(gj.get("subhalo_id") or gpath.parent.name)
        pos_igm = transform_pos_kpc(gj["center_kpc"], igm_meta)
        sub_num = gid.replace("illustris1_sub", "")
        entries.append({
            "id": gid,
            "short_id": f"Subhalo {sub_num}",
            "kind": "galaxy",
            "pos_kpc": pos_igm,
            "logMstar": safe_log10(gj.get("Mstar_Msun"), 10.9),
            "logM200c": safe_log10(gj.get("M200c_Msun"), 12.3),
            "R200c_kpc": round(float(gj.get("R200c_kpc") or 260.0), 1),
            "viz_base": f"https://huggingface.co/datasets/tanmay-starslab/tng-illustris-z0-web-0/resolve/main/{gid}/viz/",
            "portal_url": f"https://galaxies.tanmaysingh.uk/?g={gid}#tab=3d",
        })
    return entries


def build_camels_l50n512(igm_meta: dict[str, Any]) -> list[dict[str, Any]]:
    """top10_clusters from supercluster_nexus + 4 CAMELS-IllustrisTNG galaxies (tanmay-starslab/public-sims-web-0)."""
    entries: list[dict[str, Any]] = []
    entries.extend(build_top10_cluster_entries("camels_l50n512_cosmic_web", igm_meta))

    for gpath in sorted(PUBLIC_SIMS_ROOT.glob("camels_tng_mw*/galaxy.json")):
        gj = json.loads(gpath.read_text(encoding="utf-8"))
        gid = str(gj.get("subhalo_id") or gpath.parent.name)
        pos_igm = transform_pos_kpc(gj["center_kpc"], igm_meta)
        m_num = re.match(r"^camels_tng_mw(\d+)$", gid)
        short_id = f"CAMELS-TNG #{m_num.group(1)}" if m_num else gid
        entries.append({
            "id": gid,
            "short_id": short_id,
            "kind": "galaxy",
            "pos_kpc": pos_igm,
            "logMstar": safe_log10(gj.get("Mstar_Msun"), 10.5),
            "logM200c": safe_log10(gj.get("M200c_Msun"), 12.3),
            "R200c_kpc": round(float(gj.get("R200c_kpc") or 270.0), 1),
            "viz_base": f"https://huggingface.co/datasets/tanmay-starslab/public-sims-web-0/resolve/main/{gid}/viz/",
            "portal_url": f"https://galaxies.tanmaysingh.uk/?g={gid}#tab=3d",
        })
    return entries


BUILDERS = {
    "simba100_cosmic_web": build_simba100,
    "tng50_cosmic_web": build_tng50,
    "tng100_cosmic_web": build_tng100,
    "tng300_cosmic_web": build_tng300,
    "illustris1_cosmic_web": build_illustris1,
    "camels_l50n512_cosmic_web": build_camels_l50n512,
}


def main() -> int:
    catalog: dict[str, list[dict[str, Any]]] = {}
    total_galaxies = 0
    total_clusters = 0

    for sim_id, folder in BOX_MAP:
        gpath = WHOLEBOX_ROOT / folder / "galaxy.json"
        if not gpath.is_file():
            raise FileNotFoundError(f"Missing whole-box galaxy.json: {gpath}")
        igm_meta = json.loads(gpath.read_text(encoding="utf-8"))
        items = BUILDERS[sim_id](igm_meta)
        catalog[sim_id] = items
        n_gal = sum(1 for x in items if x["kind"] == "galaxy")
        n_cl = sum(1 for x in items if x["kind"] == "cluster")
        total_galaxies += n_gal
        total_clusters += n_cl
        print(f"  [{sim_id:26s}] {len(items):3d} halos ({n_gal:3d} galaxies, {n_cl:2d} clusters) | box = {igm_meta['box_kpc']/1000:.1f} Mpc")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({total_galaxies} galaxies + {total_clusters} clusters = {total_galaxies + total_clusters} total embedded 3D halos)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
