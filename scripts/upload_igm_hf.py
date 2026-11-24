#!/usr/bin/env python3
"""Upload the 6 Whole-Box IGM & Cosmic Web Atlas packs to the public Hugging Face dataset
`tanmay-starslab/igm-atlas-data` and verify anonymous HTTP/CORS access.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from huggingface_hub import CommitOperationAdd, CommitOperationDelete, HfApi

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "docs" / "igm" / "data"
REPO_ID = "tanmay-starslab/igm-atlas-data"
DEFAULT_TOKEN = Path("/scratch/tsingh65/cgm_work/cache/hf/token")

SIM_IDS = (
    "simba100_cosmic_web",
    "camels_l50n512_cosmic_web",
    "tng50_cosmic_web",
    "tng100_cosmic_web",
    "tng300_cosmic_web",
    "illustris1_cosmic_web",
)

DATASET_CARD = """---
license: cc-by-4.0
pretty_name: Multi-Simulation Intergalactic Medium (IGM) & Cosmic Web 3D + 12-Ion Sightline Atlas
tags:
  - astrophysics
  - cosmology
  - intergalactic-medium
  - cosmic-web
  - IllustrisTNG
  - SIMBA
  - CAMELS
  - WebGL2
---

# Multi-Simulation Intergalactic Medium (IGM) & Cosmic Web Atlas (`igm.tanmaysingh.uk`)

Public 3D volumetric WebP lossless slice atlases (`tng50-viz/2` schema, `256^3` 5-level nested hierarchy `L0, L1, L2, L3, L4` + starlight & dust `S0, S1, S2, S3, S4` across 18 gas/ion/velocity fields from the full 35–300 Mpc box down to individual `±400 kpc` galaxy halos and `±25 kpc` BCG/galaxy disks) and 160-ray 12-ion THOR 3D Voronoi + CLOUDY c17.03 FG11 + Rahmati13 self-shielding + `SBI_CGM` FP64 compact Voigt absorption sightline packs (`TNGS` v2 binaries, `catalog.json`, `components.json`) for the live explorer at **[igm.tanmaysingh.uk](https://igm.tanmaysingh.uk)** ([`tanmay-starslab/igm-atlas`](https://github.com/tanmay-starslab/igm-atlas)).

## Included Whole-Box $z=0$ Cosmological Simulations

1. `simba100_cosmic_web` — **SIMBA-100** ($147.1\\text{ Mpc}$ box, $100\\,h^{-1}\\text{ Mpc}$, snap 151, $z=0$)
2. `camels_l50n512_cosmic_web` — **CAMELS-IllustrisTNG-L50n512** ($74.5\\text{ Mpc}$ box, $50\\,h^{-1}\\text{ Mpc}$, snap 090, $z=0$)
3. `tng50_cosmic_web` — **TNG50-1** ($51.7\\text{ Mpc}$ box, $35\\,h^{-1}\\text{ Mpc}$, snap 099, $z=0$)
4. `tng100_cosmic_web` — **TNG100-1** ($110.7\\text{ Mpc}$ box, $75\\,h^{-1}\\text{ Mpc}$, snap 099, $z=0$)
5. `tng300_cosmic_web` — **TNG300-1** ($302.6\\text{ Mpc}$ box, $205\\,h^{-1}\\text{ Mpc}$, snap 099, $z=0$)
6. `illustris1_cosmic_web` — **Illustris-1** ($106.5\\text{ Mpc}$ box, $75\\,h^{-1}\\text{ Mpc}$, snap 135, $z=0$)
"""


def collect_pack_files(sim_id: str, pack_dir: Path) -> list[tuple[str, Path]]:
    """Collect all public web pack files for `sim_id` (excluding redundant `.gz` raw fallback duplicates)."""
    items: list[tuple[str, Path]] = []
    for name in ("galaxy.json", "catalog.json", "components.json"):
        p = pack_dir / name
        if p.is_file():
            items.append((f"{sim_id}/{name}", p))
    s_dir = pack_dir / "s"
    if s_dir.is_dir():
        for p in sorted(s_dir.glob("*.bin")):
            items.append((f"{sim_id}/s/{p.name}", p))
    viz_dir = pack_dir / "viz"
    if viz_dir.is_dir():
        for sub in ("manifest_v2.json", "luts/luts.json"):
            p = viz_dir / sub
            if p.is_file():
                items.append((f"{sim_id}/viz/{sub}", p))
        for kind in ("gas", "stars"):
            kdir = viz_dir / kind
            if kdir.is_dir():
                for p in sorted(kdir.rglob("*.webp")):
                    rel = p.relative_to(viz_dir).as_posix()
                    items.append((f"{sim_id}/viz/{rel}", p))
    return items


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=REPO_ID)
    ap.add_argument("--token-file", type=Path, default=DEFAULT_TOKEN)
    ap.add_argument("--batch-size", type=int, default=180)
    args = ap.parse_args()

    token = args.token_file.read_text().strip()
    api = HfApi(token=token)
    api.create_repo(repo_id=args.repo, repo_type="dataset", private=False, exist_ok=True)
    print(f"[hf] Using public dataset repo: https://huggingface.co/datasets/{args.repo}", flush=True)

    existing = set()
    try:
        for info in api.list_repo_tree(repo_id=args.repo, repo_type="dataset", recursive=True):
            if hasattr(info, "rfilename"):
                existing.add(info.rfilename)
            elif hasattr(info, "path"):
                existing.add(info.path)
    except Exception:
        pass

    for idx, sim_id in enumerate(SIM_IDS):
        pack_dir = DATA_DIR if idx == 0 else (DATA_DIR / "gal" / sim_id)
        items = collect_pack_files(sim_id, pack_dir)
        todo = [
            (rel, p)
            for rel, p in items
            if rel not in existing or rel.endswith(".json") or rel.endswith(".bin")
        ]
        local_bins = {rel for rel, _ in items if "/s/" in rel and rel.endswith(".bin")}
        stale_bins = sorted(
            ex for ex in existing if ex.startswith(f"{sim_id}/s/") and ex.endswith(".bin") and ex not in local_bins
        )
        total_mb = sum(p.stat().st_size for _, p in todo) / 1e6
        print(
            f"[hf] {sim_id}: {len(todo)}/{len(items)} files to upload ({total_mb:.1f} MB), {len(stale_bins)} stale bins to delete",
            flush=True,
        )
        all_ops = [CommitOperationAdd(path_in_repo=rel, path_or_fileobj=str(p)) for rel, p in todo] + [
            CommitOperationDelete(path_in_repo=ex) for ex in stale_bins
        ]
        for b0 in range(0, len(all_ops), args.batch_size):
            ops = all_ops[b0 : b0 + args.batch_size]
            api.create_commit(
                repo_id=args.repo,
                repo_type="dataset",
                operations=ops,
                commit_message=f"Upload {sim_id} 160-ray structure-targeted sightline pack ({b0+1}-{b0+len(ops)}/{len(all_ops)})",
            )
            print(f"  [{sim_id}] committed {b0+1}..{b0+len(ops)} / {len(all_ops)}", flush=True)

    readme_op = [CommitOperationAdd(path_in_repo="README.md", path_or_fileobj=DATASET_CARD.encode("utf-8"))]
    api.create_commit(
        repo_id=args.repo,
        repo_type="dataset",
        operations=readme_op,
        commit_message="Update dataset card for Multi-Simulation IGM & Cosmic Web Atlas",
    )
    print(f"[hf] ALL 6 IGM Cosmic Web packs uploaded to https://huggingface.co/datasets/{args.repo}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
