# Centreline-first reconstruction of the H-Grid throat partition

Working plan. Written to be picked up cold in a new session — read
`CLAUDE.md` first, then this.

Status at time of writing: PR #8 merged to `main`. The tool has the explicit
divergence run (`buildTrajectory`), the Hypex expansion profile applied by
scaling flowed sections, the clearance metric, and the profile UI. Everything
below is what comes next.

---

## 1. The intent

Move from **boundaries-first** (cells are formed, centrelines fall out) to
**centreline-first** (paths are defined, sections are built around them).

Ordering of constraints, most-fixed first:

1. **Throat** — already well defined. The equal-area line-grid solve stays
   exactly as it is. No change.
2. **Mouth** — defined by horizontal and vertical **arc angles**, informed by
   target coverage. Currently defined by `mouthW`/`mouthH` in mm.
3. **Axial distance throat→mouth (`depth`) — deliberately NOT constrained.**
   It becomes derived.
4. **Cell paths** — launch vector from the throat's exit-cone normal / common
   apex; arrival vector from the mouth cell's own orientation. Curvature
   pushed toward the throat, where sectional area is small; path left straight
   as long as possible off the mouth, where sectional area is large.

Interpenetrating ducts are **accepted as an intermediate state**, to be
resolved later by centreline manipulation.

---

## 2. Why this is worth doing (the actual prize)

Not the gaps. The gaps already work.

Today `m` is solved from (area ratio, path length) and `fc` falls out as a
readout — `CLAUDE.md` flags this as an open loop. With `depth` free, the
inversion runs the other way:

```
set fc and T  →  m  →  required path length per cell  →  solve depth
```

`hypexLengthForRatio` already exists in `hgrid-model.js` for exactly this
inversion. **Centreline-first plus free depth is what turns `fc` from a
readout back into an input.** That is the justification for the
re-architecture; the duct gaps are a side effect that already works without
it.

---

## 3. Measured finding — corrects a claim in CLAUDE.md

`CLAUDE.md` currently states:

> Because equal-area cells and a uniform mouth grid give every cell the SAME
> expansion ratio, fc differs between cells only through path length —
> equalising dL equalises the cutoff too.

**This is false as measured.** A uniform x/y mouth lattice projected onto a
curved cap stretches the outer cells: surface area goes as planar area
divided by `cos(tilt)`, so cells at the edge end up larger.

Measured, 6×3, `t=0`, mouth 200×100, apex 120, depth 150, flatten 1:

| quantity | spread |
|---|---|
| throat area | 0.0000 % (the solve works) |
| **mouth area** | **5.71 %** |
| **expansion ratio** | **5.71 %** |
| solid angle | 5.71 % |
| path length | 5.08 % |

On a more curved cap (`flatten = 0.55`) mouth-area spread blows up to
**52.6 %**, so this is not a small-parameter curiosity.

The *direction* of the CLAUDE.md claim survives, though. Decomposing the `fc`
spread by freezing one variable at its mean:

| T | fc range | full spread | path length alone | area ratio alone |
|---|---|---|---|---|
| 0 | 779–811 Hz | 3.93 % | 5.07 % | 1.34 % |
| 1 | 540–559 Hz | 3.45 % | 5.07 % | 1.89 % |

Path length dominates by roughly 3×, and the two terms **partially cancel** —
outer cells have both longer paths and larger ratios, which push `fc` in
opposite directions, so the full spread is *smaller* than path length alone
would give.

**Action:** correct that CLAUDE.md bullet. Equalising ΔL is the dominant
lever on `fc`, not the only one, and the residual should be reported as a
decomposition rather than asserted to be zero.

**Consequence for the plan:** the unequal-mouth-area problem is not created by
moving to arc angles. **It already exists, unreported.** Arc angles make it
explicit and controllable. It was never a correctness bug either — the
profile already solves `m` per cell from that cell's own ratio and own `L`,
so unequal ratios are absorbed. They show up only as spread in `fc`.

---

## 4. The mouth: three constraints, and how a multicell resolves them

At the mouth you want three things:

1. **Equal expansion ratio** per cell (equal loading) → equal mouth **area**
2. **Equal coverage** per cell → equal **solid angle**
3. Cell mouths **tile** the aperture (continuous radiating surface)

**On a sphere centred at the apex, area = r²Ω, so (1) and (2) are the same
constraint.** That collapses the problem.

And all three are then simultaneously satisfiable: a rectangular grid with
equal Δazimuth and equal Δ(sin elevation) — the Lambert equal-area
arrangement — tiles exactly, with equal area and equal solid angle. The only
thing given up is equal angular *width* per cell: outer rows span more degrees
each. That is an acceptable price, because what gets specified is the **total**
Θh and Θv, not the per-cell angle.

### What the traditional multicell does

A classic multicell makes every cell an **identical** horn — same profile,
same mouth, aimed on a radial fan from a common apex. Identical mouth at
identical radius gives identical solid angle *and* identical expansion ratio,
exactly, for free.

What it pays is constraint (3): identical flat facets cannot tile a curved
surface, so leftover wedges open between cell mouths. **Those are the flat
filler webs visible between cell exits** — the observation that prompted this
section is correct. The multicell resolves the tension by *dropping tiling*,
not by compensating area. The cost is acoustic and well known: the webs and
facet edges are diffracting discontinuities in the radiating surface.

### The two options considered, and why they are not alternatives

They answer different questions and could both be done:

- **Morph the mouth apertures to equalise area** — answers *how big is each
  cell's mouth*. This is the direct fix. On a spherical cap it is closed form
  (equal Δ(sin elev)), no solve needed; on a general cap it is the same class
  of problem `solveEqualArea` already handles for the throat. **Recommended.**

- **Round the cell mouth edges into arcs** — answers *what shape is the cell
  mouth and how do neighbours meet*. Genuinely buys two things: a rounded
  cross-section raises `f1` for a given area (a circle is the optimum), which
  is exactly what the partition exists to do; and it avoids the sharp facet
  edges of a true multicell. But it deliberately breaks tiling, leaving inert
  area between cell mouths — the same class of radiating discontinuity as the
  multicell's webs, just smoother — and it does **not** fix the area
  distribution. **Defer as a cross-section refinement.**

  Note also that "cells gradually intersect at the mouth" is not physical —
  two ducts cannot share an opening. What is meant is walls merging
  tangentially rather than at a sharp corner, which is a filleting question
  best handled at export/CAD stage, not in the section geometry.

**Decision: spherical cap about the apex, subdivided equal-solid-angle.**
Gets all three constraints at once. Report the residual `fc` spread with the
path-length-vs-area-ratio decomposition above.

---

## 5. Obstacles, each with its fix

**5.1 The throat mating face goes non-planar again.**
Today station 0 *is* the throat outline in the throat plane, by construction.
Sweep a section perpendicular to the launch tangent and it tilts down the exit
cone — the recorded 6.85° / ±0.5 mm bug, with no common face to seat the
driver on.
*Fix:* the section plane must be **specified, not inherited from the tangent**.
Blend the section normal `ẑ` at s=0 → tangent through the interior → aperture
normal at s=1. The existing `area` vs `axial` bookkeeping handles the
obliquity this creates.

**5.2 Twist must be imposed, not measured.**
`rmfTransport` gives a spin-free frame; the mouth cell's orientation will not
match it. Today `twistDeg` is a diagnostic only. Centreline-first must
**distribute** that residual roll along the path, or the section arrives
rotated against the mouth quad and corner-to-corner correspondence breaks —
a throat corner flowing to the middle of a mouth edge, which is the failure
`hgrid-model.js:1533-1538` was written to prevent.

**5.3 A cubic Hermite does not have the freedom the design wants.**
Endpoints and both end directions fixed leaves exactly two free scalars: the
tangent magnitudes. And `tight` currently scales both equally
(`hgrid-model.js:1400`). Two cheap moves get most of it:
- Split `tight` into `tightThroat` / `tightMouth`. A large mouth-side
  magnitude makes the curve leave the mouth straighter for longer — directly
  "reduce curvature where area is large".
- Add a mouth-side straight run mirroring the throat-side `divergeLen`.
  `buildTrajectory` is already *straight + Hermite*; making it
  *straight + Hermite + straight* is the same G¹ trick at both ends.

Resist a general 3-D spline until the composite provably cannot reach a needed
shape. Higher order buys freedom and curvature oscillation in the same
purchase, and curvature is the thing being controlled.

**5.4 The divider inset assumes ducts merge.**
`dividerEndFrac` tapers the t/2 inset to zero. Once ducts are genuinely
separate solids each wants full wall thickness along its free length. Revisit
in the same phase that lets ducts detach.

**5.5 Downstream is safe — this is what makes phasing possible.**
`ductSolids` → `ductSections` → `ductMesh` → `buildSTL` consume only
`rows[].sched[].pts`, with the 64-point / corners-at-0,16,32,48 convention.
Emit the same ring structure and every mesh test, the volume identity,
manifoldness and STL export carry over untouched. The new construction is a
drop-in replacement for the **ring generator**, nothing more.

---

## 6. Phases

Each lands useful on its own. A, B, C cannot break the geometry; D is the only
risky one.

**A — Signed clearance.**
Upgrade the clearance metric from unsigned minimum distance to **signed
interpenetration depth**. Calibrate while the flow construction still holds:
it must agree with the `k ≤ 1` argument that overlap is exactly zero.
Prerequisite for everything after — today's metric only proves non-overlap by
leaning on the shrink argument (`hgrid-model.js:1746-1756`), and that argument
dies the moment sections stop being derived from a shared flow.

**B — Mouth by arc angles.**
Re-parameterise: Θh, Θv, apex. Spherical cap about the apex. Grid subdivided
equal-solid-angle (equal Δazimuth, equal Δ(sin elev)). `mouthW`/`mouthH` and
coverage become readouts. Report the `fc` decomposition from §3. Independent
of the sweep change and verifiable alone.

**C — Path family.**
Split `tight` into throat/mouth; add the mouth-side straight run. Still the
flowed construction, so nothing can interpenetrate yet — this isolates "do the
path knobs do what they claim" from the architecture risk.

**D — The architecture switch.**
Swept sections in specified planes (§5.1), imposed twist (§5.2), ends pinned
to the throat polygon and the mouth quad. The expansion profile becomes
**primary** — it drives section scale directly rather than correcting a flowed
section. Interpenetration returns here; Phase A is what makes it visible.

**E — `fc` as an input.**
Invert the profile: `fc` and `T` set → `m` → required path length per cell →
solve `depth` and the path knobs to deliver it.

---

## 7. Verification

Against closed forms, never the tool's own prior output (CLAUDE.md standing
rule). `npm run test:hgrid` must carry each of these.

- **Signed clearance:** agrees with the `k ≤ 1` argument (overlap exactly
  zero) while the flow construction still holds. That agreement is the
  calibration.
- **Equal-solid-angle mouth:** per-cell solid angles equal to quadrature
  tolerance; sum equals the requested Θh × Θv coverage; mouth W/H against
  closed forms.
- **Section planes:** station 0 lies in z=0 to 1e-12 (test already exists);
  station N lies on the aperture surface.
- **Imposed twist:** transported frame plus imposed roll lands the cell's +i
  on the mouth's +x to tolerance.
- **Profile:** per-station area equals the closed-form Hypex value (test
  already exists — keep it).
- **`fc` inversion:** set `fc`, read back the achieved `fc`, recover to solver
  tolerance.
- **Mesh:** manifold, and volume vs integrated `axial` identity. Existing
  tests carry over unchanged.

---

## 8. Scar tissue — do not undo this by accident

Phase D **will regress** the test *"neighbours share their whole boundary at
every station"* (currently 6.6e-10 mm). That test encodes an invariant being
traded away **on purpose**.

Replace it with the signed-clearance bound; do not delete it silently. Update
the CLAUDE.md note to say the trade was intentional and what replaced it —
otherwise a future session reads the interpenetration scar tissue, concludes
the architecture is the old bug returning, and reverts it on sight.

The distinction that makes the trade defensible: the old interpenetration was
fatal because it was both **invisible** and **unfixable** — no parameter
existed that could move two ducts apart. Both halves have changed. The Hypex
profile already moves sections inward (`k < 1` is what opens today's gaps),
and centreline manipulation is the stronger second mechanism. Overlap becomes
a constraint that gets solved, not an artifact to live with — **provided
Phase A lands first so it can be seen.**
