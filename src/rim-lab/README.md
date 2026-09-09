# Ginkgo Rim Lab

Independent experiment at `ginkgo-rim-lab.html`, duplicated from main c83f088.
The original UI, model, worker and exports remain unchanged. This snapshot is
intentional for A/B comparison; later core fixes need explicit review and tests
before being ported here. Do not import these modules into the original tool.

The original flareProfile/flareCollar implementation is removed from this model.
The exterior-boundary reader is retained and extended to estimate incoming
section curvature from three duct stations. The new rim-geometry module uses:

- Circle: equal profile axes, tangent to the incoming wall.
- Ellipse: independently chosen axes.
- Quintic Hermite profile: the ellipse's endpoint and ending tangent, measured
  incoming section curvature, and zero ending curvature.

The last two share endpoints, not necessarily their intermediate envelope.
Axes are measured in the incoming wall frame, so they are not global horn
width/depth. Circle uses the outward scale for both axes. Baffle mode ends at
90 degrees from the local aperture normal; a curved aperture needs a matching
curved baffle. Freestanding mode uses the chosen ending direction. A final
exposed edge remains; neither mode claims elimination of diffraction.

The full rim has twelve pieces: two half-sides and a corner patch per quadrant.
Shared endpoint sections are identical. Side/corner lofts share a transverse
derivative field; sampled STEP tangent-plane mismatch is checked below 0.1
degree, excluding the retained pole. The sharp inner corner is a pole; this
is not a claim of global G2 continuity at corners or across inherited cell seams.
Incoming curvature is a finite-station estimate, not the exact CAD wall jet.
The shell back root seats on the aperture and blends to a normal offset.
The air-facing profile is the acoustic candidate; back-face curvature is not
constrained. Small radii versus thickness and outward reversals are refused.

STEP uses quintic section interpolation with tangent and curvature constraints
for these rim pieces; ordinary natural cubics would erase the intended end
curvature. Cell surfaces keep their existing cubic chord-length loft. Whole-shell
orientation is used for rim volume checking because a per-face radial proxy is
invalid on a rolled strip. Exported settings include the experimental tool name,
rim settings, and a model hash covering both geometry modules. Replay rebuilds
the selected rim from those settings.

Preview/report construction waits for the checked export-resolution map. Rim
settings invalidate pending shell downloads. Invalid rims block shell export
rather than silently disappearing. Duct-only exports intentionally remain air
passages. Region selection controls rim pieces as well as shell cells.

Tests: independent circle/ellipse equations, endpoint/curvature constraints,
unchanged baseline cell geometry, aperture attachment, shared patch sections,
flat/curved mouths, termination variants, surface residual/volume and STEP
metadata replay. Playwright covers the second home-page link, isolation of the
original, controls, stale-export gating and downloaded metadata.

No BEM/FEM or measured diffraction benefit is provided. Cell loading/path
readouts exclude the external rim's acoustic interaction. Compare candidates
with the same aperture, source conditions and mounting geometry, using polar
response and reflected energy as well as on-axis response.
