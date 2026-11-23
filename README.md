# Multi-Simulation Intergalactic Medium (IGM) & Cosmic Web Atlas (`igm.tanmaysingh.uk`)

[![Live Explorer](https://img.shields.io/badge/Live_Atlas-igm.tanmaysingh.uk-f59e0b?style=for-the-badge)](https://igm.tanmaysingh.uk/)
[![License: MIT](https://img.shields.io/badge/Code-MIT-10b981?style=for-the-badge)](LICENSE)
[![Data: CC BY 4.0](https://img.shields.io/badge/Data-CC_BY_4.0-60a5fa?style=for-the-badge)](https://creativecommons.org/licenses/by/4.0/)

Interactive browser-native **WebGL2 3D volumetric cosmic-web renderer** + **12-ion Voigt-profile absorption sightline explorer** for the multi-phase **Intergalactic Medium (IGM)** and **Warm-Hot Intergalactic Medium (WHIM)** across **35 to 302.6 Mpc** cosmological volumes at $z=0$.

---

## Cross-Scale Astrophysical Atlas Suite

| Scale Regime | Physical Extent | Live Portal | Repository |
| :--- | :--- | :--- | :--- |
| **ISM** (Interstellar Medium) | $\text{AU} \to 1\text{ kpc}$ | [`ism.tanmaysingh.uk`](https://ism.tanmaysingh.uk) | [`tanmay-starslab/multiphase-ism`](https://github.com/tanmay-starslab/multiphase-ism) |
| **CGM** (Circumgalactic Medium) | $1\text{ kpc} \to 400\text{ kpc}$ | [`galaxies.tanmaysingh.uk`](https://galaxies.tanmaysingh.uk) | [`tanmay-starslab/cgm-atlas`](https://github.com/tanmay-starslab/cgm-atlas) |
| **ICM** (Intracluster Medium) | $100\text{ kpc} \to 4\text{ Mpc}$ | [`icm.tanmaysingh.uk`](https://icm.tanmaysingh.uk) | [`tanmay-starslab/icm-atlas`](https://github.com/tanmay-starslab/icm-atlas) |
| **IGM** (Intergalactic Medium & Cosmic Web) | $1\text{ Mpc} \to 302.6\text{ Mpc}$ | **[`igm.tanmaysingh.uk`](https://igm.tanmaysingh.uk)** | **[`tanmay-starslab/igm-atlas`](https://github.com/tanmay-starslab/igm-atlas)** |

---

## Six Whole-Box $z=0$ Cosmological Simulations

Switch seamlessly in the top header between **six whole-box hydrodynamic simulations** spanning **$51.7\text{ Mpc}$ to $302.6\text{ Mpc}$**:

1. **`SIMBA-100` (`simba100_cosmic_web`)** — $147.1\text{ Mpc}$ box ($100\,h^{-1}\text{ Mpc}$, Gizmo MFM, $1024^3$ gas + $1024^3$ DM, snap 151 at $z=0$, centered on the primary $M_{200c} = 10^{15.05}\,M_\odot$ supercluster knot with explicit jet/radiative/X-ray AGN feedback).
2. **`CAMELS-IllustrisTNG-L50n512` (`camels_l50n512_cosmic_web`)** — $74.5\text{ Mpc}$ box ($50\,h^{-1}\text{ Mpc}$, AREPO moving-mesh, $512^3$ gas + $512^3$ DM, snap 090 at $z=0$, centered on the $M_{200c} = 10^{14.34}\,M_\odot$ primary cluster node).
3. **`TNG50-1` (`tng50_cosmic_web`)** — $51.7\text{ Mpc}$ box ($35\,h^{-1}\text{ Mpc}$, AREPO MHD, $2160^3$ gas cells, snap 099 at $z=0$, resolving fine Ly$\alpha$ forest sheets and dwarf galaxy filament feeding).
4. **`TNG100-1` (`tng100_cosmic_web`)** — $110.7\text{ Mpc}$ box ($75\,h^{-1}\text{ Mpc}$, AREPO MHD, $1820^3$ gas cells, snap 099 at $z=0$, centered on the $M_{200c} = 10^{14.58}\,M_\odot$ supercluster nexus).
5. **`TNG300-1` (`tng300_cosmic_web`)** — $302.6\text{ Mpc}$ box ($205\,h^{-1}\text{ Mpc}$, AREPO MHD, $2500^3$ gas cells, snap 099 at $z=0$, centered on the $M_{200c} = 10^{15.19}\,M_\odot$ Coma-analog supercluster and $300\text{ Mpc}$ cosmic web).
6. **`Illustris-1` (`illustris1_cosmic_web`)** — $106.5\text{ Mpc}$ box ($75\,h^{-1}\text{ Mpc}$, AREPO hydrodynamic reference with strong radio-mode AGN bubble heating into the IGM at $z=0$).

---

## Multi-Nested 3D Volumetric Grid Hierarchy & 12-Ion Sightline Spectroscopy

Each simulation volume provides a 3-level nested $256^3$ volumetric hierarchy (`L0` supercluster knot zoom, `L1` filament corridor, `L2` whole-box cosmic web) across **18 physical fields** (`nH`, `T`, `Z`, `vrad`, `vmag`, `Pth`, `tcool`, `HI`, `MgII`, `SiII`, `SiIII`, `SiIV`, `CII`, `CIV`, `OVI`, `NV`, `OVII`, `NeVIII`, plus dark matter density `dm` and stellar luminosity `star` context layers) paired with **120 synthetic quasar absorption sightlines** per volume:

- **Diffuse Ly$\alpha$ Forest ($\log T \sim 3.8\text{–}4.5\text{ K}$)**: Photoionized cosmic sheets and filaments traced by $\text{H\,I}$ ($\lambda 1215\text{ \AA}$) and $\text{Si\,III}$ ($\lambda 1206\text{ \AA}$).
- **Metal-Enriched Filament Spines ($\log T \sim 4.5\text{–}5.3\text{ K}$)**: Feedback-polluted IGM filaments around galaxy groups traced by $\text{C\,IV}$ ($\lambda\lambda 1548, 1550\text{ \AA}$), $\text{Si\,IV}$ ($\lambda\lambda 1393, 1402\text{ \AA}$), and $\text{N\,V}$ ($\lambda\lambda 1238, 1242\text{ \AA}$).
- **Warm-Hot Intergalactic Medium — WHIM ($\log T \sim 5.3\text{–}6.7\text{ K}$)**: Accretion shocks and WHIM sheets hosting the missing baryons at $z=0$, traced by UV $\text{O\,VI}$ ($\lambda\lambda 1031, 1037\text{ \AA}$), extreme-UV $\text{Ne\,VIII}$ ($\lambda\lambda 770, 780\text{ \AA}$), and X-ray $\text{O\,VII}$ ($21.60\text{ \AA}$).
- **Supercluster Nexus & ICM Shocks ($\log T > 6.7\text{ K}$)**: Virialized cluster knots at the intersections of cosmic filaments.

---

## Bring Your Own Cosmological Volume (`tngsight`)

Convert any cosmological HDF5 snapshot (IllustrisTNG, SIMBA, CAMELS, EAGLE, Ramses, Gizmo, Enzo, Athena++) or 3D NumPy array into a static `vizpack v2` bundle:

```bash
python scripts/build_igm_showcase.py --workers 16
python -m tngsight.vizpack validate docs/igm/data/viz
```

## License & Attribution

- **Source Code**: MIT License (`LICENSE`).
- **Derived Volumetric & Spectral Atlases**: CC BY 4.0 (`Tanmay Singh`).
