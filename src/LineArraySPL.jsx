import React, { useState, useMemo, useEffect } from "react";
import { C, SERIES } from "./palette.js";
import * as M from "./line-spl-model.js";

// ═══════════════════════════════════════════════════════════════════
// LINE ARRAY SPL — maximum level from a wall-to-wall line of small drivers
// ═══════════════════════════════════════════════════════════════════
//
// PURPOSE
//   A row of identical small drivers spanning a room's width, wall to wall.
//   The side walls mirror the row, so it behaves as a much longer line: its
//   level falls 3 dB per doubling of distance instead of 6. This tool asks
//   how loud such a line can go — per frequency, and on broadband programme —
//   at three listener distances, before the drivers run out of heat or cone
//   travel. It is for choosing a driver and a pitch, and costing the result.
//
// MODEL (physics lives in line-spl-model.js, tested by
// scripts/test-line-spl.mjs against closed forms)
//   Each driver is a point source with the lateral directivity of a baffled
//   rigid piston, 2·J1(ka·sinθ)/(ka·sinθ), pointing along the room. The side
//   walls are mirrors with pressure reflection R = √(1 − α), and images are
//   summed to many orders (outer orders windowed so the lossless sum
//   converges). The pressure at the listener is the direct complex sum:
//     G = 20·log10 | Σ a·D(θ)·e^{−jkR}/R |     relative to one driver at 1 m
//   For lossless walls and d < λ this reproduces the infinite-line limit
//   10·log10(λ/(r·d²)) — the test suite checks it — and above c/d it shows
//   grating-lobe interference across the width, which the limit cannot.
//   One driver's ceiling at 1 m is min(thermal, excursion):
//     thermal   = sensitivity (1 W/1 m, half-space) + 10·log10(P)
//     excursion = 20·log10(ρ·ω²·Sd·Xmax / (2π·√2·p_ref))   (+12 dB/oct)
//   Broadband: the system is EQ'd so band levels at the reference distance
//   follow pink noise plus a tilt. Working back through the line gain gives
//   each ⅓-octave band's electrical power and cone travel; the level rises
//   until total power hits the rating or RMS travel × crest factor hits Xmax.
//
// KNOWN LIMITS — and which way each one errs
//   · The vertical plane is not modelled. Everything that shapes coverage
//     front to back — the waveguide, the ceiling — enters as one number, the
//     "waveguide gain" toward the listener, ramped in over the octave below its
//     onset frequency. That number is an ASSUMPTION; 10·log10(180°/coverage°)
//     is a first estimate. Set it to 0 for the bare-baffle answer.
//   · The ceiling is the drivers' baffle (sensitivity is already half-space).
//     The floor bounce, the far wall, the stage wall and reverberation are
//     absent. Direct sound only: in a real room the steady level is HIGHER,
//     by up to ~3 dB from the floor alone at low frequencies.
//   · Sensitivity is flat (the piston-band figure). Real cones rise on axis
//     as they beam, so above ~2 kHz the true on-axis level is somewhat higher
//     than shown. Use the Thiele-Small-derived sensitivity (112.1 + 10·log η₀),
//     not a datasheet headline averaged over a rising band.
//   · Wall reflection uses one α for all frequencies and angles. Real walls
//     absorb more at grazing incidence and at high frequency, so the
//     far-image contributions — which matter most at low frequency and long
//     distance — are overstated for absorptive walls.
//   · Excursion is the mass-controlled value, valid above the system's
//     resonance. Near and below resonance, and with a high-pass filter in
//     the chain, real travel differs; keep the band's low edge ≥ 1.5× Fs.
//   · Power compression is one fixed dB loss at full power. It is really
//     programme- and time-dependent; 1–3 dB is typical for small ferrite
//     drivers at rated power.
//   · An offset double row is modelled as one row at half pitch; the two
//     rows' small separation along the room is ignored, which is fair below
//     the frequency where that offset reaches a quarter wavelength.
//   · Levels are unweighted, in the drivers' band only; the low-mid section
//     and subwoofers are not included.
//
// The tool is good for: comparing drivers, pitches and wall treatment on one
// basis, and seeing where heat, cone travel and pitch each set the limit.
// Absolute dB carry the waveguide-gain assumption with them.

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const fmt = (v, dec = 1) => (v == null || !isFinite(v) ? "—" : v.toFixed(dec));
const fmtHz = (v) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${Math.round(v)}`);

// Presets: sensitivity is 112.1 + 10·log10(η₀) from each datasheet's Eta Zero,
// not the headline figure. 3FE25: η₀ 0.28 / 0.22 / 0.17 % for 4 / 8 / 16 Ω.
const PRESETS = {
  "3fe25-8": { name: "FaitalPRO 3FE25 · 8 Ω", sens: 85.5, P: 20, Sd: 33, Xmax: 1.83, dia: 65, frame: 81, Fs: 110 },
  "3fe25-4": { name: "FaitalPRO 3FE25 · 4 Ω", sens: 86.6, P: 20, Sd: 33, Xmax: 1.73, dia: 65, frame: 81, Fs: 110 },
  "3fe25-16": { name: "FaitalPRO 3FE25 · 16 Ω", sens: 84.4, P: 20, Sd: 33, Xmax: 1.83, dia: 65, frame: 81, Fs: 110 },
  custom: { name: "Custom" },
};

const sInput = {
  background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 4,
  color: C.ink, padding: "6px 8px", fontFamily: C.mono, fontSize: 13,
  width: "100%", boxSizing: "border-box", outline: "none",
};
const sLabel = {
  fontSize: 11, color: C.inkDim, fontFamily: C.sans,
  marginBottom: 3, display: "block", letterSpacing: "0.03em",
};

function NumInput({ label, value, onChange, unit, min, max, step = 1, accent }) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  const commit = () => {
    const p = parseFloat(local);
    if (!isNaN(p)) onChange(Math.min(Math.max(p, min ?? -Infinity), max ?? Infinity));
    else setLocal(String(value));
  };
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={sLabel}>{label} {unit && <span style={{ color: C.inkMuted }}>({unit})</span>}</label>
      <input type="number" value={local} min={min} max={max} step={step}
        onChange={(e) => setLocal(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
        style={{ ...sInput, ...(accent ? { borderColor: accent } : {}) }} />
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={sLabel}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={sInput}>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </div>
  );
}

// ─────────────────────────────────────────────
// PLOT — hand-rolled SVG, optional log x
// series: [{ pts: [[x, y]], color, dash, label }]
// marks:  [{ x, label, color }]  vertical markers
// ─────────────────────────────────────────────
function Plot({ series, marks = [], xLog, xMin, xMax, yMin, yMax, yStep = 10, xTicks, xFmt, xLabel, yLabel, height = 260 }) {
  const W = 760, H = height, padL = 44, padR = 12, padT = 10, padB = 30;
  const tx = (x) => xLog ? Math.log10(x) : x;
  const lx = (x) => padL + ((tx(x) - tx(xMin)) / (tx(xMax) - tx(xMin))) * (W - padL - padR);
  const ly = (y) => padT + ((yMax - Math.max(yMin, Math.min(yMax, y))) / (yMax - yMin)) * (H - padT - padB);
  const yTicks = [];
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) yTicks.push(y);
  const baseY = H - padB;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {yTicks.map((y) => (
        <g key={"y" + y}>
          <line x1={padL} x2={W - padR} y1={ly(y)} y2={ly(y)} stroke={C.border} strokeWidth={0.5} />
          <text x={padL - 6} y={ly(y) + 3} fontSize={10} fill={C.inkMuted} textAnchor="end" fontFamily={C.mono}>{y}</text>
        </g>
      ))}
      {xTicks.filter((v) => v >= xMin && v <= xMax).map((v) => (
        <g key={"x" + v}>
          <line x1={lx(v)} x2={lx(v)} y1={padT} y2={baseY} stroke={C.border} strokeWidth={0.5} />
          <text x={lx(v)} y={baseY + 12} fontSize={10} fill={C.inkMuted} textAnchor="middle" fontFamily={C.mono}>{xFmt(v)}</text>
        </g>
      ))}
      {marks.filter((m) => m.x >= xMin && m.x <= xMax).map((m, i) => (
        <g key={"m" + i}>
          <line x1={lx(m.x)} x2={lx(m.x)} y1={padT} y2={baseY} stroke={m.color} strokeWidth={1} strokeDasharray="4 3" />
          <text x={lx(m.x) + 4} y={padT + 10 + 12 * i} fontSize={10} fill={m.color} fontFamily={C.mono}>{m.label}</text>
        </g>
      ))}
      {series.map((s, i) => (
        <path key={i} fill="none" stroke={s.color} strokeWidth={s.width || 1.6} strokeDasharray={s.dash}
          d={s.pts.map(([x, y], j) => `${j ? "L" : "M"}${lx(x).toFixed(1)},${ly(y).toFixed(1)}`).join(" ")} />
      ))}
      <text x={W - padR} y={H - 2} fontSize={10} fill={C.inkDim} textAnchor="end" fontFamily={C.mono}>{xLabel}</text>
      <text x={12} y={padT + 4} fontSize={10} fill={C.inkDim} fontFamily={C.mono}
        transform={`rotate(-90 12 ${padT + 4})`} textAnchor="end">{yLabel}</text>
    </svg>
  );
}

function Legend({ items }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 10, fontFamily: C.mono, color: C.inkDim, marginTop: 6 }}>
      {items.map((it, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <svg width={18} height={6}><line x1={0} x2={18} y1={3} y2={3} stroke={it.color} strokeWidth={2} strokeDasharray={it.dash} /></svg>
          {it.label}
        </span>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════
export default function LineArraySPL() {
  // room & line
  const [Wroom, setWroom] = useState(3.5);
  const [pitchMm, setPitchMm] = useState(82);
  const [rows, setRows] = useState("1");
  const [alpha, setAlpha] = useState(0.1);
  const [temp, setTemp] = useState(25);
  // driver
  const [preset, setPreset] = useState("3fe25-8");
  const [sens, setSens] = useState(PRESETS["3fe25-8"].sens);
  const [P, setP] = useState(PRESETS["3fe25-8"].P);
  const [Sd, setSd] = useState(PRESETS["3fe25-8"].Sd);
  const [Xmax, setXmax] = useState(PRESETS["3fe25-8"].Xmax);
  const [dia, setDia] = useState(PRESETS["3fe25-8"].dia);
  const [lateralDir, setLateralDir] = useState("on");
  // system
  const [wg, setWg] = useState(6);
  const [fWg, setFWg] = useState(1500);
  const [comp, setComp] = useState(2);
  const [crest, setCrest] = useState(6);
  const [fLo, setFLo] = useState(250);
  const [fHi, setFHi] = useState(8000);
  const [tilt, setTilt] = useState(0);
  const [refIdx, setRefIdx] = useState("1");
  // listeners
  const [drop, setDrop] = useState(1.8);
  const [y1, setY1] = useState(2);
  const [y2, setY2] = useState(8);
  const [y3, setY3] = useState(16);
  const [widthPos, setWidthPos] = useState("1");
  const [distF, setDistF] = useState(1000);

  const applyPreset = (k) => {
    setPreset(k);
    const p = PRESETS[k];
    if (k === "custom") return;
    setSens(p.sens); setP(p.P); setSd(p.Sd); setXmax(p.Xmax); setDia(p.dia);
    setPitchMm(Math.max(p.frame + 1, pitchMm));
  };

  const c = M.speedOfSound(temp);
  const rho = M.airDensity(temp);
  const d = pitchMm / 1000;
  const nRows = Number(rows);
  const N = Math.max(1, Math.floor(Wroom / d + 1e-9));
  const nDrivers = N * nRows;
  const xs = useMemo(() => M.linePositions(N, d, nRows), [N, d, nRows]);
  const R = Math.sqrt(Math.max(0, 1 - alpha));
  const opts = useMemo(() => ({ W: Wroom, R, c, effDia: lateralDir === "on" ? dia / 1000 : 0 }), [Wroom, R, c, lateralDir, dia]);
  const optsFree = useMemo(() => ({ ...opts, R: 0 }), [opts]);
  const ys = [y1, y2, y3];
  const rs = ys.map((y) => Math.hypot(y, drop));
  const fGrating = c / (d / nRows);
  const fExc = M.excursionThermalCrossover(sens, P, Sd * 1e-4, Xmax * 1e-3, rho);
  const posCols = [SERIES[0], SERIES[1], SERIES[2]];

  // ── single-tone ceiling vs frequency ──
  const toneCurves = useMemo(() => {
    const fs = [];
    for (let f = 100; f <= 16000 * 1.001; f *= 2 ** (1 / 12)) fs.push(f);
    return rs.map((r) => fs.map((f) => {
      const one = Math.min(M.thermalSpl1m(sens, P), M.excursionSpl1m(f, Sd * 1e-4, Xmax * 1e-3, rho));
      return [f, one + M.waveguideDb(f, wg, fWg) - comp + M.bandGainDb(f, 1 / 12, 0, r, xs, opts, 3)];
    }));
  }, [rs[0], rs[1], rs[2], sens, P, Sd, Xmax, rho, wg, fWg, comp, xs, opts]);

  // ── broadband ──
  const bb = useMemo(() => {
    const bands = M.thirdOctaveBands(fLo, fHi);
    if (bands.length === 0) return null;
    const g = rs.map((r) => bands.map((fc) => M.bandGainDb(fc, 1 / 3, 0, r, xs, opts)));
    const ri = Number(refIdx);
    const res = M.broadband({ bands, gainRef: g[ri], sens, P, Sd: Sd * 1e-4, Xmax: Xmax * 1e-3, rho, wg, fWg, tilt, crestDb: crest });
    const at = rs.map((_, k) => M.powerSumDb(bands.map((fc, i) => res.perDriver1m[i] + g[k][i] + M.waveguideDb(fc, wg, fWg))) - comp);
    return { ...res, bands, at };
  }, [fLo, fHi, rs[0], rs[1], rs[2], xs, opts, refIdx, sens, P, Sd, Xmax, rho, wg, fWg, tilt, crest, comp]);

  // ── level vs distance at one frequency ──
  const distCurves = useMemo(() => {
    const ds = [];
    for (let r = 1; r <= 32 * 1.001; r *= 2 ** (1 / 6)) ds.push(r);
    const walls = ds.map((r) => [r, M.bandGainDb(distF, 1 / 6, 0, r, xs, opts, 3)]);
    const free = ds.map((r) => [r, M.bandGainDb(distF, 1 / 6, 0, r, xs, optsFree, 3)]);
    const r0 = rs[0];
    const g0 = M.bandGainDb(distF, 1 / 6, 0, r0, xs, opts, 3);
    const s3 = ds.map((r) => [r, g0 - 10 * Math.log10(r / r0)]);
    const s6 = ds.map((r) => [r, g0 - 20 * Math.log10(r / r0)]);
    return { walls, free, s3, s6 };
  }, [distF, xs, opts, optsFree, rs[0]]);

  // ── across the width at one listener distance ──
  const widthFs = [1000, Math.round(fGrating * 1.25), Math.round(fGrating * 2)];
  const widthCurves = useMemo(() => {
    const r = rs[Number(widthPos)];
    return widthFs.map((f) => {
      // re the power average across the width: the centre line can itself sit
      // in an interference dip above c/d, which would make every other point
      // look loud
      const raw = [];
      for (let i = 0; i <= 80; i++) {
        const x = -Wroom / 2 + (Wroom * i) / 80;
        raw.push([x, M.lineGainDb(f, x, r, xs, opts)]);
      }
      const ref = 10 * Math.log10(raw.reduce((a, [, g]) => a + 10 ** (g / 10), 0) / raw.length);
      return raw.map(([x, g]) => [x, g - ref]);
    });
  }, [widthPos, rs[0], rs[1], rs[2], xs, opts, Wroom, fGrating]);

  // ── layout ──
  const card = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14, marginBottom: 14 };
  const secTitle = { fontSize: 11, fontWeight: 600, color: C.inkDim, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" };
  const sub = { textTransform: "none", letterSpacing: 0, fontWeight: 400, color: C.inkMuted };
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "0 12px" };
  const note = { fontSize: 10, color: C.inkMuted, marginTop: 8, lineHeight: 1.5 };
  const fTicks = [100, 200, 500, 1000, 2000, 5000, 10000];

  const stats = [
    { label: "Drivers", value: `${nDrivers}`, sub: `${N} per row × ${nRows} · ${pitchMm} mm pitch${nRows > 1 ? ` → ${fmt(pitchMm / nRows, 0)} mm effective` : ""}` },
    { label: "Grating limit c/d", value: `${fmtHz(fGrating)} Hz`, sub: "above this the row stops acting as one continuous source" },
    { label: "Excursion = thermal at", value: `${fmtHz(fExc)} Hz`, sub: "below this, cone travel sets the ceiling" },
    { label: "Rated power, whole line", value: `${fmt(nDrivers * P, 0)} W`, sub: bb ? `broadband draw ${fmt(nDrivers * bb.powerTotal, 0)} W continuous` : "" },
    { label: "Side walls", value: `R = ${fmt(R, 2)}`, sub: `pressure reflection, √(1 − α), α = ${alpha}` },
  ];

  return (
    <div style={{ background: C.page, color: C.ink, fontFamily: C.sans, padding: "16px 18px", minHeight: "100vh", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 600, color: C.accent, margin: 0, letterSpacing: "0.05em" }}>
          LINE ARRAY SPL</h1>
        <div style={{ fontSize: 11, color: C.inkDim, marginTop: 2, marginBottom: 14 }}>
          Maximum level from a wall-to-wall row of small drivers — the side walls mirror it into a longer line. Direct sound only; see the assumptions at the foot of the page.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "0 14px" }}>
          <div style={card}>
            <div style={secTitle}>Room · line</div>
            <div style={grid}>
              <NumInput label="Room width (wall to wall)" value={Wroom} onChange={setWroom} unit="m" min={0.2} max={30} step={0.1} />
              <NumInput label="Driver pitch" value={pitchMm} onChange={setPitchMm} unit="mm" min={10} max={1000} />
              <Select label="Rows" value={rows} onChange={setRows} options={[["1", "single row"], ["2", "offset double row"]]} />
              <NumInput label="Side-wall absorption α" value={alpha} onChange={setAlpha} min={0} max={1} step={0.05} />
              <NumInput label="Air temperature" value={temp} onChange={setTemp} unit="°C" min={-10} max={45} />
            </div>
          </div>
          <div style={card}>
            <div style={secTitle}>Driver</div>
            <div style={grid}>
              <Select label="Preset" value={preset} onChange={applyPreset} options={Object.entries(PRESETS).map(([k, v]) => [k, v.name])} />
              <NumInput label="Sensitivity 1 W/1 m" value={sens} onChange={(v) => { setSens(v); setPreset("custom"); }} unit="dB" min={60} max={110} step={0.1} />
              <NumInput label="Continuous (AES) power" value={P} onChange={(v) => { setP(v); setPreset("custom"); }} unit="W" min={0.1} max={2000} />
              <NumInput label="Sd" value={Sd} onChange={(v) => { setSd(v); setPreset("custom"); }} unit="cm²" min={1} max={2000} />
              <NumInput label="Xmax (one way)" value={Xmax} onChange={(v) => { setXmax(v); setPreset("custom"); }} unit="mm" min={0.1} max={30} step={0.01} />
              <NumInput label="Effective diameter" value={dia} onChange={(v) => { setDia(v); setPreset("custom"); }} unit="mm" min={5} max={500} />
              <Select label="Lateral directivity" value={lateralDir} onChange={setLateralDir} options={[["on", "piston"], ["off", "omni"]]} />
            </div>
            <div style={note}>Sensitivity: use 112.1 + 10·log10(η₀) from the datasheet, not the headline figure. For the 3FE25 · 8 Ω that is 85.5 dB against a headline of 91.</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "0 14px" }}>
          <div style={card}>
            <div style={secTitle}>System · programme</div>
            <div style={grid}>
              <NumInput label="Waveguide gain (assumed)" value={wg} onChange={setWg} unit="dB" min={0} max={20} step={0.5} />
              <NumInput label="… full from" value={fWg} onChange={setFWg} unit="Hz" min={100} max={10000} />
              <NumInput label="Power compression" value={comp} onChange={setComp} unit="dB" min={0} max={6} step={0.5} />
              <NumInput label="Crest factor" value={crest} onChange={setCrest} unit="dB" min={0} max={20} />
              <NumInput label="Band low edge" value={fLo} onChange={setFLo} unit="Hz" min={50} max={2000} />
              <NumInput label="Band high edge" value={fHi} onChange={setFHi} unit="Hz" min={500} max={20000} />
              <NumInput label="Programme tilt re pink" value={tilt} onChange={setTilt} unit="dB/oct" min={-6} max={6} step={0.5} />
              <Select label="EQ'd flat at" value={refIdx} onChange={setRefIdx} options={[["0", "position A"], ["1", "position B"], ["2", "position C"]]} />
            </div>
          </div>
          <div style={card}>
            <div style={secTitle}>Listeners · along the room</div>
            <div style={grid}>
              <NumInput label="Drop, line to ear" value={drop} onChange={setDrop} unit="m" min={0} max={20} step={0.1} />
              <NumInput label="A — distance" value={y1} onChange={setY1} unit="m" min={0.2} max={100} step={0.5} accent={posCols[0]} />
              <NumInput label="B — distance" value={y2} onChange={setY2} unit="m" min={0.2} max={100} step={0.5} accent={posCols[1]} />
              <NumInput label="C — distance" value={y3} onChange={setY3} unit="m" min={0.2} max={100} step={0.5} accent={posCols[2]} />
            </div>
            <div style={note}>Distance is horizontal, along the room. The line-to-ear distance is √(distance² + drop²): {rs.map((r) => fmt(r, 1)).join(" · ")} m. Listeners are on the room's centre line.</div>
          </div>
        </div>

        <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          {stats.map((s) => (
            <div key={s.label}>
              <div style={{ fontSize: 10, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
              <div style={{ fontSize: 17, fontFamily: C.mono, color: C.ink, marginTop: 2 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: C.inkDim }}>{s.sub}</div>
            </div>
          ))}
        </div>

        <div style={card}>
          <div style={secTitle}>Broadband maximum · pink{tilt ? ` ${tilt > 0 ? "+" : ""}${tilt} dB/oct` : ""}, {fmtHz(fLo)}–{fmtHz(fHi)} Hz
            <span style={sub}> · unweighted, direct sound</span></div>
          {bb && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 12 }}>
              <thead>
                <tr style={{ color: C.inkMuted, fontSize: 10, textAlign: "right" }}>
                  {["position", "distance (m)", "continuous (dB)", "peaks (dB)"].map((t) => (
                    <th key={t} style={{ padding: "4px 8px", borderBottom: `1px solid ${C.border}`, fontWeight: 500 }}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bb.at.map((L, k) => (
                  <tr key={k} style={{ textAlign: "right" }}>
                    <td style={{ padding: "3px 8px", color: posCols[k] }}>{"ABC"[k]}{String(k) === refIdx ? " · EQ ref" : ""}</td>
                    <td style={{ padding: "3px 8px" }}>{fmt(ys[k], 1)}</td>
                    <td style={{ padding: "3px 8px", color: C.ink }}>{fmt(L, 1)}</td>
                    <td style={{ padding: "3px 8px", color: C.inkDim }}>{fmt(L + crest, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {bb && (
            <div style={note}>
              Limited by <b style={{ color: C.ink }}>{bb.limit === "thermal" ? "heat" : "cone travel"}</b>, {fmt(bb.marginDb, 1)} dB before the other limit.
              Peak cone travel {fmt(bb.excursionPeak * 1000, 2)} mm of {Xmax} mm Xmax at that level.
              Each driver draws {fmt(bb.powerTotal, 1)} W continuous, {fmt(bb.powerTotal * 10 ** (crest / 10), 0)} W on peaks; most of it goes to the top bands, because the line's gain falls 3 dB/oct.
              Peaks = continuous + crest factor.
            </div>
          )}
        </div>

        <div style={card}>
          <div style={secTitle}>Single-tone ceiling vs frequency
            <span style={sub}> · one frequency at full power, ¹⁄₁₂-octave smoothed</span></div>
          <Plot series={toneCurves.map((pts, k) => ({ pts, color: posCols[k] }))}
            marks={[{ x: fGrating, label: "c/d", color: C.reference }, { x: fExc, label: "excursion | heat", color: C.series5 }]}
            xLog xMin={100} xMax={16000} yMin={80} yMax={130} xTicks={fTicks} xFmt={fmtHz} xLabel="Hz" yLabel="dB SPL" />
          <Legend items={rs.map((r, k) => ({ color: posCols[k], label: `${"ABC"[k]} · ${fmt(ys[k], 1)} m` }))} />
          <div style={note}>Not a broadband figure: each point puts the whole power rating into one frequency. Read it for where each limit bites. The fall from low to high frequency is the line's λ term, 3 dB/oct; the waveguide gain then lifts the top.</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "0 14px" }}>
          <div style={card}>
            <div style={secTitle}>Line gain vs distance
              <span style={sub}> · at {distF} Hz, re one driver at 1 m</span></div>
            <div style={{ maxWidth: 160 }}><NumInput label="Frequency" value={distF} onChange={setDistF} unit="Hz" min={50} max={16000} /></div>
            <Plot series={[
              { pts: distCurves.s6, color: C.inkMuted, dash: "2 3", width: 1 },
              { pts: distCurves.s3, color: C.inkMuted, dash: "6 3", width: 1 },
              { pts: distCurves.free, color: SERIES[3] },
              { pts: distCurves.walls, color: SERIES[4] },
            ]} xLog xMin={1} xMax={32} yMin={-30} yMax={30} xTicks={[1, 2, 4, 8, 16, 32]} xFmt={(v) => `${v}`}
              xLabel="m from line" yLabel="dB" height={240} />
            <Legend items={[
              { color: SERIES[4], label: `with side walls (α ${alpha})` },
              { color: SERIES[3], label: "no wall reflections" },
              { color: C.inkMuted, dash: "6 3", label: "−3 dB/doubling" },
              { color: C.inkMuted, dash: "2 3", label: "−6 dB/doubling" },
            ]} />
          </div>
          <div style={card}>
            <div style={secTitle}>Across the width
              <span style={sub}> · re the average across the width</span></div>
            <div style={{ maxWidth: 160 }}>
              <Select label="At position" value={widthPos} onChange={setWidthPos} options={[["0", `A · ${fmt(ys[0], 1)} m`], ["1", `B · ${fmt(ys[1], 1)} m`], ["2", `C · ${fmt(ys[2], 1)} m`]]} />
            </div>
            <Plot series={widthCurves.map((pts, k) => ({ pts, color: SERIES[k + 4] || SERIES[k] }))}
              xMin={-Wroom / 2} xMax={Wroom / 2} yMin={-20} yMax={10} yStep={5}
              xTicks={[-1.5, -1, -0.5, 0, 0.5, 1, 1.5].map((v) => v * Wroom / 3)} xFmt={(v) => v.toFixed(1)}
              xLabel="m across" yLabel="dB" height={240} />
            <Legend items={widthFs.map((f, k) => ({ color: SERIES[k + 4] || SERIES[k], label: `${fmtHz(f)} Hz` }))} />
            <div style={note}>Below c/d the level is even across the room. Above it, the row's extra beams (grating lobes) bounce off the side walls and interfere. The piston directivity setting shows how much the cones' own beaming suppresses them.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
