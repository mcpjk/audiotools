import React, { useState, useMemo, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════
// DIRECTIVITY MATCH — horn ↔ cone crossover tool
// ═══════════════════════════════════════════════════════════════════
//
// PURPOSE
//   Find the crossover frequency at which a horn and the cone below it
//   have the same −6 dB coverage, so the system's directivity index (DI)
//   passes through crossover without a step. A DI step is the failure
//   mode that EQ cannot fix: it moves direct and reflected energy
//   together, so flattening the on-axis response leaves the reverberant
//   field wrong (and vice versa).
//
// MODELS (all stated, none hidden)
//   Cone   · rigid circular piston in an infinite baffle.
//            p(θ)/p(0) = 2·J₁(ka·sinθ) / (ka·sinθ)
//            −6 dB when the first crossing of 0.5 is reached;
//            ka·sinθ ≈ 2.215 at that point.
//            If ka < 2.215 there is no crossing inside 90° → 180° (clamped).
//
//   Horn   · two regimes, whichever is WIDER wins:
//            (a) aperture-limited, below pattern control —
//                rectangular aperture of width D, sin(u)/u,
//                −6 dB at u = 1.8955 → sinθ = 0.6034·λ/D
//            (b) wall-controlled, above pattern control —
//                coverage held at the nominal design angle.
//            coverage(f) = max(nominal, aperture(f)), clamped to 180°.
//
//   DI     · Molloy's equation from the two −6 dB full angles:
//            DI = 10·log₁₀( 180 / arcsin( sin(α/2)·sin(β/2) ) )   [degrees]
//            Sanity check: α = β = 180° → DI = 3.01 dB (half space). ✓
//
// KNOWN LIMITS — read before trusting a number
//   · Real cones are not rigid pistons near the top of their range.
//     Cone flexure usually makes measured coverage WIDER than piston
//     theory predicts, often by 10–20° in the octave below breakup.
//     Treat the cone curve as a conservative (narrow) estimate.
//   · Real CD horns are not perfectly constant-directivity. Most
//     over-widen slightly just below the pattern-control limit, and
//     most narrow again in the top octave as the throat and the
//     driver's own diaphragm directivity take over. This model shows
//     neither — it is a piecewise idealisation.
//   · Baffle step is ignored. Below roughly c/(π·W_baffle) the cone
//     radiates into full space and coverage exceeds 180°. Irrelevant
//     at crossover frequencies; do not read the far left of the plot
//     as physical.
//   · The horn aperture model assumes a rectangular mouth radiating
//     into a baffle. A free-standing or heavily-rounded mouth will
//     differ, mostly in the pattern-control transition region.
//   · Nothing here models the summing of the two sources through the
//     crossover region. Both curves are shown; the system's real
//     behaviour crossfades between them over roughly an octave.
//
// The numbers this tool is good for: WHERE the curves cross, and HOW
// BIG the DI gap is at your chosen crossover. Those are robust to the
// simplifications above. Absolute coverage angles are not.

// ─────────────────────────────────────────────
// PHYSICS
// ─────────────────────────────────────────────
const speedOfSound = (tC) => 331.3 * Math.sqrt(1 + tC / 273.15);

// Bessel J₁ — Abramowitz & Stegun 9.4.4 / 9.4.5 polynomial approximations
const besselJ1 = (x) => {
  const ax = Math.abs(x);
  let r;
  if (ax < 3) {
    const y = (x / 3) * (x / 3);
    r =
      x *
      (0.5 +
        y *
          (-0.56249985 +
            y *
              (0.21093573 +
                y *
                  (-0.03954289 +
                    y * (0.00443319 + y * (-0.00031761 + y * 0.00001109))))));
  } else {
    const z = 3 / ax;
    const f1 =
      0.79788456 +
      z *
        (0.00000156 +
          z *
            (0.01659667 +
              z *
                (0.00017105 +
                  z * (-0.00249511 + z * (0.00113653 + z * -0.00020033)))));
    const t1 =
      ax -
      2.35619449 +
      z *
        (0.12499612 +
          z *
            (0.0000565 +
              z *
                (-0.00637879 +
                  z * (0.00074348 + z * (0.00079824 + z * -0.00029166)))));
    r = Math.sqrt(0.636619772 / ax) * Math.cos(t1) * f1 * 0.5 * Math.sqrt(ax);
    // normalise the A&S form: J₁(x) = sqrt(2/(πx))·f₁·cos(θ₁)
    r = Math.sqrt(2 / (Math.PI * ax)) * f1 * Math.cos(t1);
    if (x < 0) r = -r;
  }
  return r;
};

// Circular piston in infinite baffle — full −6 dB coverage angle, degrees
const coneCoverage = (f, radius_m, c) => {
  const ka = ((2 * Math.PI * f) / c) * radius_m;
  if (ka < 2.2) return 180; // no −6 dB point inside 90°
  // first crossing of |2J₁(u)/u| = 0.5 is at u ≈ 2.2153
  const u_target = 2.2153;
  const sinTheta = u_target / ka;
  if (sinTheta >= 1) return 180;
  return 2 * (Math.asin(sinTheta) * 180) / Math.PI;
};

// Rectangular aperture of width D — full −6 dB coverage angle, degrees
const apertureCoverage = (f, D_m, c) => {
  const lambda = c / f;
  const sinTheta = (0.6034 * lambda) / D_m;
  if (sinTheta >= 1) return 180;
  return 2 * (Math.asin(sinTheta) * 180) / Math.PI;
};

// Horn — wider of (aperture limit, nominal wall-controlled angle)
const hornCoverage = (f, D_m, nominal_deg, c) =>
  Math.min(180, Math.max(nominal_deg, apertureCoverage(f, D_m, c)));

// Molloy directivity index from two −6 dB full angles (degrees)
const molloyDI = (h_deg, v_deg) => {
  const s =
    Math.sin(((h_deg / 2) * Math.PI) / 180) *
    Math.sin(((v_deg / 2) * Math.PI) / 180);
  const clamped = Math.min(Math.max(s, 1e-6), 1);
  const denom = (Math.asin(clamped) * 180) / Math.PI;
  return 10 * Math.log10(180 / denom);
};

const fmt = (v, dec = 1) => {
  if (v == null || isNaN(v) || !isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 100) return v.toFixed(Math.min(dec, 1));
  return v.toFixed(dec);
};

// ─────────────────────────────────────────────
// PALETTE — matches the other tools in this project
// ─────────────────────────────────────────────
const C = {
  bg: "#0c0f14", surface: "#151a23", surfaceAlt: "#1a2030",
  border: "#2a3040", borderLight: "#3a4558",
  text: "#d8dee8", textDim: "#7a8598", textMuted: "#4e5a6e",
  amber: "#e8a040", blue: "#4a9ade", cyan: "#50c8c8",
  green: "#48b858", red: "#e05050", violet: "#9a7adb", white: "#e8e8e8",
  mono: "'SF Mono','Cascadia Code','Fira Code','Consolas',monospace",
  sans: "-apple-system,'Segoe UI','Helvetica Neue',sans-serif",
};
const sInput = {
  background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 4,
  color: C.text, padding: "6px 8px", fontFamily: C.mono, fontSize: 13,
  width: "100%", boxSizing: "border-box", outline: "none",
};
const sLabel = {
  fontSize: 11, color: C.textDim, fontFamily: C.sans,
  marginBottom: 3, display: "block", letterSpacing: "0.03em",
};

function NumInput({ label, value, onChange, unit, min, max, step: s = 1, accent }) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  const commit = () => {
    const p = parseFloat(local);
    if (!isNaN(p)) onChange(Math.min(Math.max(p, min ?? -Infinity), max ?? Infinity));
    else setLocal(String(value));
  };
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={sLabel}>{label} {unit && <span style={{ color: C.textMuted }}>({unit})</span>}</label>
      <input type="number" value={local} min={min} max={max} step={s}
        onChange={(e) => setLocal(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
        style={{ ...sInput, ...(accent ? { borderColor: accent } : {}) }} />
    </div>
  );
}

// ═════════════════════════════════════════════
export default function DirectivityMatch() {
  const [temperature, setTemperature] = useState(30);

  // horn
  const [hornNomH, setHornNomH] = useState(120);
  const [hornNomV, setHornNomV] = useState(60);
  const [mouthW, setMouthW] = useState(300);
  const [mouthH, setMouthH] = useState(180);

  // cone below the horn
  const [coneDia, setConeDia] = useState(140);
  const [fx, setFx] = useState(1400);

  // optional second cone (3-way)
  const [use3way, setUse3way] = useState(false);
  const [woofDia, setWoofDia] = useState(260);
  const [fx2, setFx2] = useState(350);

  // plane shown
  const [plane, setPlane] = useState("H");

  const c = useMemo(() => speedOfSound(temperature), [temperature]);

  const nominal = plane === "H" ? hornNomH : hornNomV;
  const mouthDim = plane === "H" ? mouthW : mouthH;

  // frequency grid, log-spaced
  const freqs = useMemo(() => {
    const out = [];
    const f0 = 150, f1 = 20000, N = 400;
    for (let i = 0; i <= N; i++) out.push(f0 * Math.pow(f1 / f0, i / N));
    return out;
  }, []);

  const curves = useMemo(() => {
    const D = mouthDim / 1000;
    const a1 = coneDia / 2000;
    const a2 = woofDia / 2000;
    return freqs.map((f) => {
      const h = hornCoverage(f, D, nominal, c);
      const hOther = hornCoverage(
        f, (plane === "H" ? mouthH : mouthW) / 1000,
        plane === "H" ? hornNomV : hornNomH, c
      );
      const m = coneCoverage(f, a1, c);
      const w = coneCoverage(f, a2, c);
      return {
        f,
        horn: h,
        hornDI: plane === "H" ? molloyDI(h, hOther) : molloyDI(hOther, h),
        cone: m,
        coneDI: molloyDI(m, m),
        woof: w,
        woofDI: molloyDI(w, w),
      };
    });
  }, [freqs, mouthDim, mouthW, mouthH, nominal, hornNomH, hornNomV, coneDia, woofDia, c, plane]);

  const at = (fTarget) => {
    let best = curves[0];
    for (const p of curves) if (Math.abs(p.f - fTarget) < Math.abs(best.f - fTarget)) best = p;
    return best;
  };

  const atFx = at(fx);
  const atFx2 = at(fx2);

  // suggested crossover: where cone coverage equals horn coverage
  const suggestedFx = useMemo(() => {
    for (let i = 1; i < curves.length; i++) {
      const a = curves[i - 1], b = curves[i];
      const da = a.cone - a.horn, db = b.cone - b.horn;
      if (da === 0) return a.f;
      if (da > 0 && db <= 0) {
        const t = da / (da - db);
        return a.f + t * (b.f - a.f);
      }
    }
    return null;
  }, [curves]);

  const suggestedFx2 = useMemo(() => {
    if (!use3way) return null;
    for (let i = 1; i < curves.length; i++) {
      const a = curves[i - 1], b = curves[i];
      const da = a.woof - a.cone, db = b.woof - b.cone;
      if (da > 0 && db <= 0) {
        const t = da / (da - db);
        return a.f + t * (b.f - a.f);
      }
    }
    return null;
  }, [curves, use3way]);

  const diStep = atFx.hornDI - atFx.coneDI;
  const diStep2 = use3way ? atFx2.coneDI - atFx2.woofDI : null;

  const verdict = (step) => {
    const a = Math.abs(step);
    if (a < 1.5) return { txt: "well matched", col: C.green };
    if (a < 3) return { txt: "audible, tolerable", col: C.amber };
    return { txt: "clear step", col: C.red };
  };

  // ── plot geometry ──
  const pW = 820, pH = 300, pdL = 52, pdR = 16, pdT = 14, pdB = 34;
  const iW = pW - pdL - pdR, iH = pH - pdT - pdB;
  const fMin = 150, fMax = 20000;
  const sx = (f) => pdL + (Math.log10(f / fMin) / Math.log10(fMax / fMin)) * iW;

  const syAng = (a) => pdT + iH - (a / 190) * iH;
  const maxDI = 20;
  const syDI = (d) => pdT + iH - (Math.min(d, maxDI) / maxDI) * iH;

  const pathOf = (key, syf) =>
    curves.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.f).toFixed(1)},${syf(p[key]).toFixed(1)}`).join(" ");

  const decades = [];
  for (const d of [200, 300, 500, 700, 1000, 2000, 3000, 5000, 7000, 10000, 20000]) {
    if (d >= fMin && d <= fMax) decades.push(d);
  }
  const fLabel = (f) => (f >= 1000 ? `${f / 1000}k` : `${f}`);

  const exportCSV = () => {
    const rows = curves
      .map((p) => `${p.f.toFixed(1)},${p.horn.toFixed(2)},${p.hornDI.toFixed(3)},${p.cone.toFixed(2)},${p.coneDI.toFixed(3)},${p.woof.toFixed(2)},${p.woofDI.toFixed(3)}`)
      .join("\n");
    const blob = new Blob(
      ["freq_hz,horn_cov_deg,horn_DI_dB,cone_cov_deg,cone_DI_dB,woofer_cov_deg,woofer_DI_dB\n" + rows],
      { type: "text/csv" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `directivity_match_${plane}_fx${Math.round(fx)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14, marginBottom: 14 };
  const secTitle = { fontSize: 11, fontWeight: 600, color: C.textDim, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" };
  const btn = (active, col) => ({
    background: active ? col + "20" : "transparent",
    border: `1px solid ${active ? col : C.border}`,
    borderRadius: 3, color: active ? col : C.textDim, fontSize: 10,
    padding: "3px 10px", cursor: "pointer", fontFamily: C.mono,
  });

  const Plot = ({ title, syf, keys, yTicks, yLabel, unit }) => (
    <div style={{ ...card, paddingBottom: 6 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
        <span style={secTitle}>{title}</span>
      </div>
      <svg viewBox={`0 0 ${pW} ${pH}`} width="100%" style={{ display: "block" }}>
        {decades.map((d) => (
          <g key={`x${d}`}>
            <line x1={sx(d)} y1={pdT} x2={sx(d)} y2={pdT + iH} stroke={C.border} strokeWidth={0.5} />
            <text x={sx(d)} y={pdT + iH + 16} fill={C.textMuted} fontSize={10} textAnchor="middle" fontFamily={C.mono}>{fLabel(d)}</text>
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={pdL} y1={syf(t)} x2={pdL + iW} y2={syf(t)} stroke={C.border} strokeWidth={0.5} strokeDasharray="3 3" />
            <text x={pdL - 6} y={syf(t) + 3} fill={C.textMuted} fontSize={10} textAnchor="end" fontFamily={C.mono}>{t}</text>
          </g>
        ))}

        {/* crossover markers */}
        <line x1={sx(fx)} y1={pdT} x2={sx(fx)} y2={pdT + iH} stroke={C.white} strokeWidth={1.2} strokeDasharray="4 3" opacity={0.55} />
        <text x={sx(fx)} y={pdT + 10} fill={C.white} fontSize={9} textAnchor="middle" fontFamily={C.mono} opacity={0.8}>Fx</text>
        {use3way && (
          <>
            <line x1={sx(fx2)} y1={pdT} x2={sx(fx2)} y2={pdT + iH} stroke={C.white} strokeWidth={1} strokeDasharray="4 3" opacity={0.35} />
            <text x={sx(fx2)} y={pdT + 10} fill={C.white} fontSize={9} textAnchor="middle" fontFamily={C.mono} opacity={0.6}>Fx2</text>
          </>
        )}
        {suggestedFx && (
          <line x1={sx(suggestedFx)} y1={pdT} x2={sx(suggestedFx)} y2={pdT + iH} stroke={C.green} strokeWidth={1} strokeDasharray="2 4" opacity={0.6} />
        )}

        {keys.map((k) => (
          <path key={k.key} d={pathOf(k.key, syf)} fill="none" stroke={k.col} strokeWidth={2.2}
            strokeDasharray={k.dash || undefined} opacity={k.op ?? 1} />
        ))}

        <text x={pdL + iW / 2} y={pH - 4} fill={C.textDim} fontSize={11} textAnchor="middle" fontFamily={C.sans}>Frequency (Hz)</text>
        <text x={13} y={pdT + iH / 2} fill={C.textDim} fontSize={11} textAnchor="middle" fontFamily={C.sans}
          transform={`rotate(-90 13 ${pdT + iH / 2})`}>{yLabel}</text>
      </svg>
    </div>
  );

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: C.sans, padding: "16px 18px", minHeight: "100vh", boxSizing: "border-box" }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 600, color: C.amber, margin: 0, letterSpacing: "0.05em" }}>
          DIRECTIVITY MATCH
        </h1>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
          −6 dB coverage and directivity index through crossover · piston cone vs pattern-controlled horn
        </div>
      </div>

      {/* HORN */}
      <div style={card}>
        <div style={secTitle}>Horn</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0 12px" }}>
          <NumInput label="Nominal coverage H" value={hornNomH} onChange={setHornNomH} unit="°" min={20} max={180} step={5} accent={C.amber} />
          <NumInput label="Nominal coverage V" value={hornNomV} onChange={setHornNomV} unit="°" min={20} max={180} step={5} accent={C.amber} />
          <NumInput label="Mouth width" value={mouthW} onChange={setMouthW} unit="mm" min={50} max={2000} step={10} accent={C.amber} />
          <NumInput label="Mouth height" value={mouthH} onChange={setMouthH} unit="mm" min={50} max={2000} step={10} accent={C.amber} />
          <NumInput label="Temperature" value={temperature} onChange={setTemperature} unit="°C" min={-10} max={50} step={1} />
        </div>
      </div>

      {/* CONES */}
      <div style={card}>
        <div style={secTitle}>Cone below the horn</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0 12px" }}>
          <NumInput label="Effective cone ⌀" value={coneDia} onChange={setConeDia} unit="mm" min={30} max={600} step={5} accent={C.blue} />
          <NumInput label="Crossover Fx" value={fx} onChange={setFx} unit="Hz" min={200} max={8000} step={50} accent={C.white} />
          <div style={{ gridColumn: "span 3", display: "flex", alignItems: "center", gap: 10, paddingTop: 18 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
              <input type="checkbox" checked={use3way} onChange={(e) => setUse3way(e.target.checked)} style={{ accentColor: C.cyan }} />
              <span style={{ color: C.cyan }}>Add a woofer below (3-way)</span>
            </label>
          </div>
        </div>
        {use3way && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0 12px", borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 4 }}>
            <NumInput label="Effective woofer ⌀" value={woofDia} onChange={setWoofDia} unit="mm" min={80} max={700} step={5} accent={C.cyan} />
            <NumInput label="Lower crossover Fx2" value={fx2} onChange={setFx2} unit="Hz" min={80} max={2000} step={10} accent={C.white} />
          </div>
        )}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 4, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: C.textDim }}>Plane shown:</span>
          <button onClick={() => setPlane("H")} style={btn(plane === "H", C.amber)}>Horizontal</button>
          <button onClick={() => setPlane("V")} style={btn(plane === "V", C.amber)}>Vertical</button>
          {suggestedFx && (
            <button onClick={() => setFx(Math.round(suggestedFx / 10) * 10)} style={{ ...btn(false, C.green), color: C.green, borderColor: C.green }}>
              Snap Fx to match ({fmt(suggestedFx, 0)} Hz)
            </button>
          )}
          {use3way && suggestedFx2 && (
            <button onClick={() => setFx2(Math.round(suggestedFx2 / 10) * 10)} style={{ ...btn(false, C.green), color: C.green, borderColor: C.green }}>
              Snap Fx2 ({fmt(suggestedFx2, 0)} Hz)
            </button>
          )}
        </div>
      </div>

      {/* METRICS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 14 }}>
        {[
          { label: `Horn coverage @ Fx (${plane})`, value: `${fmt(atFx.horn, 0)}°`, sub: `nominal ${nominal}°`, color: C.amber },
          { label: `Cone coverage @ Fx`, value: `${fmt(atFx.cone, 0)}°`, sub: `⌀${coneDia} mm piston`, color: C.blue },
          {
            label: "DI step at Fx",
            value: `${diStep >= 0 ? "+" : ""}${fmt(diStep, 1)} dB`,
            sub: verdict(diStep).txt,
            color: verdict(diStep).col,
          },
          {
            label: "Matched crossover",
            value: suggestedFx ? `${fmt(suggestedFx, 0)} Hz` : "none in band",
            sub: suggestedFx ? "cone ≡ horn coverage" : "curves never cross",
            color: C.green,
          },
          { label: "Horn pattern control", value: `≥ ${fmt(0.6034 * c * 1000 / (mouthDim * Math.sin((nominal / 2) * Math.PI / 180)), 0)} Hz`, sub: `mouth ${mouthDim} mm, ${nominal}°`, color: C.textDim },
          { label: "Speed of sound", value: `${fmt(c, 1)} m/s`, sub: `at ${temperature} °C`, color: C.textDim },
          ...(use3way
            ? [
                { label: "Woofer coverage @ Fx2", value: `${fmt(atFx2.woof, 0)}°`, sub: `⌀${woofDia} mm piston`, color: C.cyan },
                {
                  label: "DI step at Fx2",
                  value: `${diStep2 >= 0 ? "+" : ""}${fmt(diStep2, 1)} dB`,
                  sub: verdict(diStep2).txt,
                  color: verdict(diStep2).col,
                },
              ]
            : []),
        ].map((it, i) => (
          <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px 10px" }}>
            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 3 }}>{it.label}</div>
            <div style={{ fontSize: 15, fontFamily: C.mono, fontWeight: 600, color: it.color || C.text }}>{it.value}</div>
            {it.sub && <div style={{ fontSize: 10, color: it.color || C.textMuted, marginTop: 1 }}>{it.sub}</div>}
          </div>
        ))}
      </div>

      <Plot
        title={`−6 dB coverage angle · ${plane === "H" ? "horizontal" : "vertical"} plane`}
        syf={syAng}
        yTicks={[0, 30, 60, 90, 120, 150, 180]}
        yLabel="Coverage (° full angle)"
        keys={[
          { key: "horn", col: C.amber },
          { key: "cone", col: C.blue },
          ...(use3way ? [{ key: "woof", col: C.cyan, dash: "6 4" }] : []),
        ]}
      />

      <Plot
        title="Directivity index (Molloy, from both planes)"
        syf={syDI}
        yTicks={[0, 4, 8, 12, 16, 20]}
        yLabel="DI (dB)"
        keys={[
          { key: "hornDI", col: C.amber },
          { key: "coneDI", col: C.blue },
          ...(use3way ? [{ key: "woofDI", col: C.cyan, dash: "6 4" }] : []),
        ]}
      />

      <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: -6, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: C.amber }}>━ Horn</span>
        <span style={{ fontSize: 10, color: C.blue }}>━ Cone</span>
        {use3way && <span style={{ fontSize: 10, color: C.cyan }}>╌ Woofer</span>}
        <span style={{ fontSize: 10, color: C.white }}>╌ Chosen crossover</span>
        <span style={{ fontSize: 10, color: C.green }}>┊ Matched crossover</span>
        <button onClick={exportCSV} style={{ ...btn(false, C.blue), color: C.blue }}>Export CSV</button>
      </div>

      {/* NOTES */}
      <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1.6, padding: "0 4px", fontFamily: C.sans }}>
        <strong style={{ color: C.textDim }}>What the curves are</strong> · Cone: rigid circular piston in an infinite baffle,
        2·J₁(ka·sinθ)/(ka·sinθ), −6 dB at ka·sinθ ≈ 2.215. Horn: the wider of (a) a rectangular aperture of the given mouth
        dimension, −6 dB at sinθ = 0.6034·λ/D, and (b) the nominal wall-controlled angle. DI is Molloy's equation from the two
        −6 dB full angles: DI = 10·log₁₀(180 / arcsin(sin(α/2)·sin(β/2))), which returns 3.01 dB for a hemisphere.
        <br />
        <strong style={{ color: C.textDim }}>What to trust</strong> · The <em>crossing point</em> of the two coverage curves and the
        <em> size of the DI gap</em> at your chosen Fx are robust. Absolute coverage angles are not — see the limits below.
        <br />
        <strong style={{ color: C.textDim }}>Stated assumptions and their direction of error</strong> ·
        Real cones flex near the top of their range and typically measure <em>wider</em> than piston theory, often by 10–20° in the
        octave below breakup — so the blue curve is a conservative (too narrow) estimate, and the true matched crossover usually
        sits a little <em>higher</em> than shown. Real CD horns over-widen slightly just below pattern control and narrow again in the
        top octave; neither is modelled. Baffle step is ignored, so the far-left of the cone curve is not physical. Mouth is assumed
        rectangular and baffled. Nothing here models how the two sources sum through crossover — the real system crossfades between
        the curves over roughly an octave rather than switching at a line.
        <br />
        <strong style={{ color: C.textDim }}>Reading the DI step</strong> · Below ~1.5 dB the transition is generally inaudible as a
        tonal shelf. Around 3 dB it is audible off-axis as a broad brightness or dullness that EQ cannot remove, because EQ moves
        direct and reverberant energy together. These thresholds are working guidance drawn from the general finding that listeners
        prefer smooth, monotonic DI — they are not a measured threshold, and I'd treat them as approximate.
        <br />
        <strong style={{ color: C.textDim }}>Effective vs nominal diameter</strong> · Enter the <em>radiating</em> diameter — cone
        plus roughly half the surround — not the nominal size. A "6.5 inch" driver is usually 130–140 mm effective, not 165 mm.
        Getting this wrong shifts the whole cone curve.
      </div>
    </div>
  );
}
