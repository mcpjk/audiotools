import React, { useState, useMemo, useEffect } from "react";
import { C } from "./palette.js";

// ═══════════════════════════════════════════════
// PHYSICS & PROFILE FUNCTIONS
// ═══════════════════════════════════════════════

const speedOfSound = (tempC) => 331.3 * Math.sqrt(1 + tempC / 273.15);

// Hypex family: r(x) = rt * (cosh(mx) + T*sinh(mx))
// T=0 → hyperbolic (cosh), T=1 → exponential
const hypexR = (x, rt, m, T) => {
  const mx = m * x;
  return rt * (Math.cosh(mx) + T * Math.sinh(mx));
};

const hypexDrDx = (x, rt, m, T) => {
  const mx = m * x;
  return rt * m * (Math.sinh(mx) + T * Math.cosh(mx));
};

// Flare rate: (1/S)(dS/dx)
const hypexFlareRate = (x, m, T) => {
  const mx = m * x;
  const num = Math.sinh(mx) + T * Math.cosh(mx);
  const den = Math.cosh(mx) + T * Math.sinh(mx);
  if (Math.abs(den) < 1e-15) return 0;
  return 2 * m * num / den;
};

// Solve for horn length given target radius ratio R = r_mouth / r_throat
// From: cosh(mL) + T*sinh(mL) = R
// Quadratic in v = e^(mL): (1+T)/2 * v² - R*v + (1-T)/2 = 0
const hypexLengthForRatio = (R, m, T) => {
  if (R <= 1) return 0;
  const a = (1 + T) / 2;
  const b = -R;
  const c_coef = (1 - T) / 2;
  const disc = b * b - 4 * a * c_coef;
  if (disc < 0) return null;
  const v = (-b + Math.sqrt(disc)) / (2 * a);
  if (v <= 0) return null;
  return Math.log(v) / m;
};

// Tractrix profile: parametric via angle parameter t
// r(t) = Rm * sin(t),  x measured from throat
const tractrixPoints = (rt_m, Rm, nPts = 500) => {
  if (rt_m >= Rm) return [];
  const t0 = Math.asin(rt_m / Rm);
  const pts = [];
  for (let i = 0; i <= nPts; i++) {
    const t = t0 + (Math.PI / 2 - t0) * (i / nPts);
    const r = Rm * Math.sin(t);
    const x =
      Rm *
      (Math.cos(t0) -
        Math.cos(t) +
        Math.log(Math.tan(t0 / 2)) -
        Math.log(Math.tan(t / 2)));
    pts.push({ x, r });
  }
  return pts;
};

// Interpolate tractrix points to regular x grid
const tractrixAtX = (tractPts, x_m) => {
  if (!tractPts.length) return null;
  for (let i = 1; i < tractPts.length; i++) {
    if (tractPts[i].x >= x_m) {
      const frac =
        (x_m - tractPts[i - 1].x) / (tractPts[i].x - tractPts[i - 1].x);
      return tractPts[i - 1].r + frac * (tractPts[i].r - tractPts[i - 1].r);
    }
  }
  return null;
};

// Format number with appropriate precision
const fmt = (v, dec = 1) => {
  if (Math.abs(v) >= 10000) return v.toFixed(0);
  if (Math.abs(v) >= 100) return v.toFixed(Math.min(dec, 1));
  if (Math.abs(v) >= 1) return v.toFixed(dec);
  return v.toPrecision(3);
};

// ═══════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════


const sInput = {
  background: C.surfaceAlt,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  color: C.text,
  padding: "6px 8px",
  fontFamily: C.mono,
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
};

const sLabel = {
  fontSize: 11,
  color: C.textDim,
  fontFamily: C.sans,
  marginBottom: 3,
  display: "block",
  letterSpacing: "0.03em",
};

// ═══════════════════════════════════════════════
// NUMERIC INPUT (stable component — defined outside
// the main function so React sees a constant identity
// across re-renders and never unmounts/remounts it)
// ═══════════════════════════════════════════════

function NumInput({ label, value, onChange, unit, min, max, step: s = 1, style: extraStyle }) {
  const [local, setLocal] = useState(String(value));

  // Sync from parent when value changes externally
  // (e.g. preset buttons, mode toggles)
  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  const commit = () => {
    const parsed = parseFloat(local);
    if (!isNaN(parsed)) {
      const lo = min != null ? min : -Infinity;
      const hi = max != null ? max : Infinity;
      onChange(Math.min(Math.max(parsed, lo), hi));
    } else {
      setLocal(String(value)); // revert invalid input
    }
  };

  return (
    <div style={{ marginBottom: 10, ...extraStyle }}>
      <label style={sLabel}>
        {label} {unit && <span style={{ color: C.textMuted }}>({unit})</span>}
      </label>
      <input
        type="number"
        value={local}
        min={min}
        max={max}
        step={s}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.target.blur(); } }}
        style={sInput}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════

export default function HornCalculator() {
  // --- State ---
  const [inputMode, setInputMode] = useState("diameter"); // 'diameter' | 'area'
  const [throatDia, setThroatDia] = useState(35.5);
  const [throatArea, setThroatArea] = useState(Math.PI * (35.5 / 2) ** 2);
  const [cutoffFreq, setCutoffFreq] = useState(1400);
  const [tParam, setTParam] = useState(0.5);
  const [lengthMode, setLengthMode] = useState("length"); // 'length' | 'mouth'
  const [hornLength, setHornLength] = useState(200);
  const [targetMouthDia, setTargetMouthDia] = useState(300);
  const [stepSize, setStepSize] = useState(10);
  const [temperature, setTemperature] = useState(30);
  const [coverageAngle, setCoverageAngle] = useState(60);
  const [showConical, setShowConical] = useState(false);
  const [conicalAngle, setConicalAngle] = useState(15);
  const [showTractrix, setShowTractrix] = useState(false);
  const [showMultiT, setShowMultiT] = useState(false);
  const [queryX, setQueryX] = useState(null); // mm, null = no query active

  // --- Derived Constants ---
  const c = useMemo(() => speedOfSound(temperature), [temperature]);

  const rt_mm = useMemo(() => {
    if (inputMode === "diameter") return throatDia / 2;
    return Math.sqrt(throatArea / Math.PI);
  }, [inputMode, throatDia, throatArea]);

  const rt_m = rt_mm / 1000;
  const St_mm2 = Math.PI * rt_mm * rt_mm;
  const St_cm2 = St_mm2 / 100;
  const m = (2 * Math.PI * cutoffFreq) / c; // flare constant, 1/m
  const lambda_c = c / cutoffFreq;
  const minMouthDia_loading = (c / (Math.PI * cutoffFreq)) * 1000; // mm
  const minMouthDia_coverage =
    (c / (cutoffFreq * Math.sin(((coverageAngle / 2) * Math.PI) / 180))) *
    1000; // mm (approximate Keele-style)

  // Effective horn length
  const effectiveLength_mm = useMemo(() => {
    if (lengthMode === "length") return hornLength;
    const R = targetMouthDia / (2 * rt_mm);
    if (R <= 1) return 10;
    const L_m = hypexLengthForRatio(R, m, tParam);
    return L_m !== null ? Math.max(L_m * 1000, 10) : hornLength;
  }, [lengthMode, hornLength, targetMouthDia, rt_mm, m, tParam]);

  // --- Profile Computation ---
  const profileData = useMemo(() => {
    const step_mm = Math.max(stepSize, 1);

    // Build x positions: exact step intervals, plus endpoint if it
    // doesn't coincide with a step (within 0.01mm tolerance)
    const xPositions_mm = [];
    for (let x = 0; x < effectiveLength_mm - 0.01; x += step_mm) {
      xPositions_mm.push(x);
    }
    if (Math.abs(xPositions_mm[xPositions_mm.length - 1] - effectiveLength_mm) > 0.01) {
      xPositions_mm.push(effectiveLength_mm);
    }

    // Tractrix reference points (dense)
    const Rm_tractrix = c / (2 * Math.PI * cutoffFreq); // mouth radius in m
    const tractPts =
      rt_m < Rm_tractrix ? tractrixPoints(rt_m, Rm_tractrix) : [];
    const tractrixLength =
      tractPts.length > 0 ? tractPts[tractPts.length - 1].x : 0;

    const points = [];
    let wallPathLength = 0;
    let prevR = rt_m;

    for (let i = 0; i < xPositions_mm.length; i++) {
      const x_mm = xPositions_mm[i];
      const x_m = x_mm / 1000;

      // Hypex
      const r_m = hypexR(x_m, rt_m, m, tParam);
      const r_mm = r_m * 1000;
      const drdx = hypexDrDx(x_m, rt_m, m, tParam);
      const wallAngle = Math.atan(drdx) * (180 / Math.PI);
      const flareRate = hypexFlareRate(x_m, m, tParam);
      const area_cm2 = (Math.PI * r_m * r_m * 1e4);

      // Wall path increment
      if (i > 0) {
        const dx = (x_mm - xPositions_mm[i - 1]) / 1000;
        const dr = r_m - prevR;
        wallPathLength += Math.sqrt(dx * dx + dr * dr);
      }
      prevR = r_m;

      // Conical
      const r_con_mm = showConical
        ? rt_mm + x_mm * Math.tan((conicalAngle * Math.PI) / 180)
        : null;

      // Tractrix
      const r_trac_m =
        showTractrix && x_m <= tractrixLength
          ? tractrixAtX(tractPts, x_m)
          : null;
      const r_trac_mm = r_trac_m !== null ? r_trac_m * 1000 : null;

      // Multi-T comparison (T=0, T=1)
      const r_t0_mm = showMultiT
        ? hypexR(x_m, rt_m, m, 0) * 1000
        : null;
      const r_t1_mm = showMultiT
        ? hypexR(x_m, rt_m, m, 1) * 1000
        : null;

      points.push({
        x_mm,
        r_mm,
        d_mm: r_mm * 2,
        area_cm2,
        wallAngle,
        flareRate,
        r_con_mm,
        r_trac_mm,
        r_t0_mm,
        r_t1_mm,
      });
    }

    const mouth = points[points.length - 1];
    return {
      points,
      mouthR_mm: mouth.r_mm,
      mouthD_mm: mouth.d_mm,
      mouthArea_cm2: mouth.area_cm2,
      compressionRatio: mouth.area_cm2 / St_cm2,
      wallPathLength_mm: wallPathLength * 1000,
      tractrixLength_mm: tractrixLength * 1000,
    };
  }, [
    effectiveLength_mm,
    stepSize,
    rt_m,
    rt_mm,
    m,
    tParam,
    c,
    cutoffFreq,
    St_cm2,
    showConical,
    conicalAngle,
    showTractrix,
    showMultiT,
  ]);

  const { points, mouthD_mm, mouthArea_cm2, compressionRatio, wallPathLength_mm, tractrixLength_mm } =
    profileData;

  // Mouth adequacy
  const mouthAdequacy = (mouthD_mm / minMouthDia_loading) * 100;
  const patternFreq =
    mouthD_mm > 0
      ? c / ((mouthD_mm / 1000) * Math.sin(((coverageAngle / 2) * Math.PI) / 180))
      : Infinity;

  // --- Point Query ---
  const queryResult = useMemo(() => {
    if (queryX == null || queryX < 0 || queryX > effectiveLength_mm) return null;
    const x_m = queryX / 1000;
    const r_m = hypexR(x_m, rt_m, m, tParam);
    const r_mm = r_m * 1000;
    const d_mm = r_mm * 2;
    const area_mm2 = Math.PI * r_mm * r_mm;
    const area_cm2 = area_mm2 / 100;
    const squareEdge_mm = Math.sqrt(area_mm2);
    const drdx = hypexDrDx(x_m, rt_m, m, tParam);
    const wallAngle = Math.atan(drdx) * (180 / Math.PI);
    const flareRate = hypexFlareRate(x_m, m, tParam);
    return { x_mm: queryX, r_mm, d_mm, area_mm2, area_cm2, squareEdge_mm, wallAngle, flareRate };
  }, [queryX, effectiveLength_mm, rt_m, m, tParam]);

  // --- CSV Export ---
  const exportCSV = () => {
    const header =
      "x_mm,diameter_mm,area_cm2,wall_angle_deg,flare_rate_per_m\n";
    const rows = points
      .map(
        (p) =>
          `${fmt(p.x_mm, 2)},${fmt(p.d_mm, 2)},${fmt(p.area_cm2, 3)},${fmt(p.wallAngle, 2)},${fmt(p.flareRate, 3)}`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `horn_T${tParam}_fc${cutoffFreq}Hz.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- SVG Plot ---
  const maxR = Math.max(...points.map((p) => p.r_mm), 1);
  const maxRAll = Math.max(
    maxR,
    showConical
      ? Math.max(...points.filter((p) => p.r_con_mm != null).map((p) => p.r_con_mm), 0)
      : 0,
    showTractrix
      ? Math.max(...points.filter((p) => p.r_trac_mm != null).map((p) => p.r_trac_mm), 0)
      : 0,
    showMultiT
      ? Math.max(
          ...points.filter((p) => p.r_t0_mm != null).map((p) => p.r_t0_mm),
          ...points.filter((p) => p.r_t1_mm != null).map((p) => p.r_t1_mm),
          0
        )
      : 0
  );
  const L = effectiveLength_mm;

  // SVG viewBox in mm coordinates, centered on axis
  const padX = L * 0.08;
  const padY = maxRAll * 0.2 + 10;
  const vbX = -padX;
  const vbY = -(maxRAll + padY);
  const vbW = L + 2 * padX;
  const vbH = 2 * (maxRAll + padY);
  const svgAspect = vbH / vbW;
  const svgHeight = Math.min(Math.max(Math.round(540 * svgAspect), 140), 420);

  // Grid lines
  const xGridStep =
    L > 1000 ? 200 : L > 500 ? 100 : L > 200 ? 50 : L > 80 ? 20 : 10;
  const yGridStep =
    maxRAll > 500
      ? 200
      : maxRAll > 200
      ? 100
      : maxRAll > 80
      ? 50
      : maxRAll > 30
      ? 20
      : 10;

  const xGridLines = [];
  for (let x = 0; x <= L; x += xGridStep) xGridLines.push(x);
  const yGridLines = [];
  for (let y = yGridStep; y <= maxRAll + yGridStep; y += yGridStep)
    yGridLines.push(y);

  // Build SVG path for horn profile (upper + lower)
  const profilePath = (pts, rKey) => {
    const filtered = pts.filter((p) => p[rKey] != null);
    if (filtered.length < 2) return "";
    const upper = filtered.map((p) => `${p.x_mm},${-p[rKey]}`).join(" L");
    const lower = [...filtered]
      .reverse()
      .map((p) => `${p.x_mm},${p[rKey]}`)
      .join(" L");
    return `M${upper} L${lower} Z`;
  };

  const profileLine = (pts, rKey) => {
    const filtered = pts.filter((p) => p[rKey] != null);
    if (filtered.length < 2) return "";
    const upper = filtered.map((p) => `${p.x_mm},${-p[rKey]}`).join(" L");
    const lower = filtered.map((p) => `${p.x_mm},${p[rKey]}`).join(" L");
    return { upper: `M${upper}`, lower: `M${lower}` };
  };

  const tLabel =
    tParam === 0
      ? "Hyperbolic (cosh)"
      : tParam === 1
      ? "Exponential"
      : `Hypex T = ${tParam}`;

  return (
    <div
      style={{
        background: C.bg,
        color: C.text,
        fontFamily: C.sans,
        padding: "16px 18px",
        minHeight: "100vh",
        boxSizing: "border-box",
      }}
    >
      {/* Title */}
      <div style={{ marginBottom: 14 }}>
        <h1
          style={{
            fontFamily: C.mono,
            fontSize: 16,
            fontWeight: 600,
            color: C.amber,
            margin: 0,
            letterSpacing: "0.05em",
          }}
        >
          HORN PROFILE CALCULATOR
        </h1>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
          Hypex family profiles · S(x) = S<sub>t</sub> × (cosh(mx) + T·sinh(mx))²
        </div>
      </div>

      {/* ── INPUTS ── */}
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: C.textDim, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Geometry & Acoustics
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 14px" }}>
          {/* Throat */}
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              {["diameter", "area"].map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    if (mode === "area" && inputMode === "diameter")
                      setThroatArea(St_mm2);
                    if (mode === "diameter" && inputMode === "area")
                      setThroatDia(rt_mm * 2);
                    setInputMode(mode);
                  }}
                  style={{
                    background: inputMode === mode ? C.amber + "20" : "transparent",
                    border: `1px solid ${inputMode === mode ? C.amber : C.border}`,
                    borderRadius: 3,
                    color: inputMode === mode ? C.amber : C.textDim,
                    fontSize: 10,
                    padding: "2px 8px",
                    cursor: "pointer",
                    fontFamily: C.mono,
                  }}
                >
                  {mode === "diameter" ? "⌀" : "Area"}
                </button>
              ))}
            </div>
            {inputMode === "diameter" ? (
              <NumInput label="Throat diameter" value={throatDia} onChange={setThroatDia} unit="mm" min={1} max={500} step={0.1} />
            ) : (
              <NumInput label="Throat area" value={parseFloat(throatArea.toFixed(1))} onChange={setThroatArea} unit="mm²" min={1} max={200000} step={1} />
            )}
            <div style={{ fontSize: 10, color: C.textMuted, marginTop: -6 }}>
              {inputMode === "diameter"
                ? `Area: ${fmt(St_mm2, 1)} mm² (${fmt(St_cm2, 2)} cm²)`
                : `⌀ ${fmt(rt_mm * 2, 1)} mm`}
            </div>
          </div>

          {/* Cutoff */}
          <NumInput label="Cutoff frequency" value={cutoffFreq} onChange={setCutoffFreq} unit="Hz" min={20} max={20000} step={10} />

          {/* T parameter */}
          <div style={{ marginBottom: 10 }}>
            <label style={sLabel}>
              T parameter{" "}
              <span style={{ color: C.amber, fontFamily: C.mono, fontSize: 10 }}>
                {tLabel}
              </span>
            </label>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.01}
              value={tParam}
              onChange={(e) => setTParam(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: C.amber }}
            />
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              {[
                { v: 0, l: "Cosh" },
                { v: 0.5, l: "0.5" },
                { v: 1, l: "Exp" },
              ].map(({ v, l }) => (
                <button
                  key={v}
                  onClick={() => setTParam(v)}
                  style={{
                    background: Math.abs(tParam - v) < 0.01 ? C.amber + "20" : "transparent",
                    border: `1px solid ${Math.abs(tParam - v) < 0.01 ? C.amber : C.border}`,
                    borderRadius: 3,
                    color: Math.abs(tParam - v) < 0.01 ? C.amber : C.textDim,
                    fontSize: 10,
                    padding: "1px 8px",
                    cursor: "pointer",
                    fontFamily: C.mono,
                  }}
                >
                  {l}
                </button>
              ))}
              <input
                type="number"
                value={tParam}
                min={0}
                max={2}
                step={0.01}
                onChange={(e) => setTParam(parseFloat(e.target.value) || 0)}
                style={{ ...sInput, width: 54, padding: "1px 4px", fontSize: 11 }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 14px", marginTop: 4 }}>
          {/* Length / Mouth mode */}
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              {[
                { m: "length", l: "Length" },
                { m: "mouth", l: "Target ⌀" },
              ].map(({ m: mode, l }) => (
                <button
                  key={mode}
                  onClick={() => setLengthMode(mode)}
                  style={{
                    background: lengthMode === mode ? C.blue + "20" : "transparent",
                    border: `1px solid ${lengthMode === mode ? C.blue : C.border}`,
                    borderRadius: 3,
                    color: lengthMode === mode ? C.blue : C.textDim,
                    fontSize: 10,
                    padding: "2px 8px",
                    cursor: "pointer",
                    fontFamily: C.mono,
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
            {lengthMode === "length" ? (
              <NumInput label="Horn length" value={hornLength} onChange={setHornLength} unit="mm" min={10} max={5000} step={5} />
            ) : (
              <NumInput label="Target mouth ⌀" value={targetMouthDia} onChange={setTargetMouthDia} unit="mm" min={rt_mm * 2 + 1} max={5000} step={5} />
            )}
            {lengthMode === "mouth" && (
              <div style={{ fontSize: 10, color: C.textMuted, marginTop: -6 }}>
                Computed length: {fmt(effectiveLength_mm, 1)} mm
              </div>
            )}
          </div>

          <NumInput label="Step interval" value={stepSize} onChange={setStepSize} unit="mm" min={1} max={200} step={1} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 8px" }}>
            <NumInput label="Temperature" value={temperature} onChange={setTemperature} unit="°C" min={-20} max={50} step={1} />
            <NumInput label="Coverage angle" value={coverageAngle} onChange={setCoverageAngle} unit="°" min={10} max={180} step={5} />
          </div>
        </div>

        {/* Comparison overlays */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.textDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Comparison Overlays
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
              <input type="checkbox" checked={showMultiT} onChange={(e) => setShowMultiT(e.target.checked)} style={{ accentColor: C.cyan }} />
              <span style={{ color: C.cyan }}>T=0 & T=1</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
              <input type="checkbox" checked={showConical} onChange={(e) => setShowConical(e.target.checked)} style={{ accentColor: C.blue }} />
              <span style={{ color: C.blue }}>Conical</span>
              {showConical && (
                <input
                  type="number"
                  value={conicalAngle}
                  min={1}
                  max={60}
                  step={1}
                  onChange={(e) => setConicalAngle(parseFloat(e.target.value) || 15)}
                  style={{ ...sInput, width: 44, padding: "1px 4px", fontSize: 11, display: "inline" }}
                />
              )}
              {showConical && <span style={{ fontSize: 10, color: C.textMuted }}>° half-angle</span>}
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
              <input type="checkbox" checked={showTractrix} onChange={(e) => setShowTractrix(e.target.checked)} style={{ accentColor: C.magenta }} />
              <span style={{ color: C.magenta }}>Tractrix</span>
              {showTractrix && (
                <span style={{ fontSize: 10, color: C.textMuted }}>
                  (L={fmt(tractrixLength_mm)}mm, ⌀{fmt(minMouthDia_loading)}mm)
                </span>
              )}
            </label>
          </div>
        </div>
      </div>

      {/* ── PROFILE PLOT ── */}
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          padding: "10px 6px 6px",
          marginBottom: 14,
        }}
      >
        <svg
          viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
          width="100%"
          height={svgHeight}
          style={{ display: "block" }}
        >
          {/* Grid */}
          {xGridLines.map((x) => (
            <g key={`xg${x}`}>
              <line x1={x} y1={-maxRAll - padY * 0.5} x2={x} y2={maxRAll + padY * 0.5} stroke={C.border} strokeWidth={vbW * 0.001} />
              <text x={x} y={maxRAll + padY * 0.7} fill={C.textMuted} fontSize={vbW * 0.025} textAnchor="middle" fontFamily={C.mono}>
                {x}
              </text>
            </g>
          ))}
          {yGridLines.map((y) => (
            <g key={`yg${y}`}>
              <line x1={-padX * 0.3} y1={-y} x2={L + padX * 0.3} y2={-y} stroke={C.border} strokeWidth={vbW * 0.0005} strokeDasharray={`${vbW * 0.005} ${vbW * 0.005}`} />
              <line x1={-padX * 0.3} y1={y} x2={L + padX * 0.3} y2={y} stroke={C.border} strokeWidth={vbW * 0.0005} strokeDasharray={`${vbW * 0.005} ${vbW * 0.005}`} />
            </g>
          ))}

          {/* Axis */}
          <line x1={-padX * 0.3} y1={0} x2={L + padX * 0.3} y2={0} stroke={C.textMuted} strokeWidth={vbW * 0.001} strokeDasharray={`${vbW * 0.008} ${vbW * 0.004}`} />

          {/* Multi-T overlay */}
          {showMultiT && (
            <>
              {["r_t0_mm", "r_t1_mm"].map((key, i) => {
                const lines = profileLine(points, key);
                if (!lines) return null;
                const col = i === 0 ? C.cyan : C.cyan;
                const opacity = 0.45;
                return (
                  <g key={key}>
                    <path d={lines.upper} fill="none" stroke={col} strokeWidth={vbW * 0.002} opacity={opacity} strokeDasharray={`${vbW * 0.006} ${vbW * 0.004}`} />
                    <path d={lines.lower} fill="none" stroke={col} strokeWidth={vbW * 0.002} opacity={opacity} strokeDasharray={`${vbW * 0.006} ${vbW * 0.004}`} />
                  </g>
                );
              })}
            </>
          )}

          {/* Conical overlay */}
          {showConical && (() => {
            const lines = profileLine(points, "r_con_mm");
            if (!lines) return null;
            return (
              <g>
                <path d={lines.upper} fill="none" stroke={C.blue} strokeWidth={vbW * 0.002} opacity={0.6} strokeDasharray={`${vbW * 0.01} ${vbW * 0.005}`} />
                <path d={lines.lower} fill="none" stroke={C.blue} strokeWidth={vbW * 0.002} opacity={0.6} strokeDasharray={`${vbW * 0.01} ${vbW * 0.005}`} />
              </g>
            );
          })()}

          {/* Tractrix overlay */}
          {showTractrix && (() => {
            const lines = profileLine(points, "r_trac_mm");
            if (!lines) return null;
            return (
              <g>
                <path d={lines.upper} fill="none" stroke={C.magenta} strokeWidth={vbW * 0.002} opacity={0.6} strokeDasharray={`${vbW * 0.004} ${vbW * 0.004}`} />
                <path d={lines.lower} fill="none" stroke={C.magenta} strokeWidth={vbW * 0.002} opacity={0.6} strokeDasharray={`${vbW * 0.004} ${vbW * 0.004}`} />
              </g>
            );
          })()}

          {/* Main profile fill */}
          <path d={profilePath(points, "r_mm")} fill={C.amber + "18"} stroke={C.amber} strokeWidth={vbW * 0.003} />

          {/* Throat and mouth dimension lines */}
          <line x1={0} y1={-rt_mm} x2={0} y2={rt_mm} stroke={C.amber} strokeWidth={vbW * 0.0015} opacity={0.5} />
          <line x1={L} y1={-points[points.length - 1].r_mm} x2={L} y2={points[points.length - 1].r_mm} stroke={C.amber} strokeWidth={vbW * 0.0015} opacity={0.5} />

          {/* Min mouth indicator */}
          {minMouthDia_loading / 2 <= maxRAll * 1.5 && (
            <>
              <line
                x1={L + padX * 0.15}
                y1={-minMouthDia_loading / 2}
                x2={L + padX * 0.15}
                y2={minMouthDia_loading / 2}
                stroke={mouthAdequacy >= 100 ? C.green : C.red}
                strokeWidth={vbW * 0.002}
                opacity={0.4}
                strokeDasharray={`${vbW * 0.003} ${vbW * 0.003}`}
              />
              <text
                x={L + padX * 0.22}
                y={0}
                fill={mouthAdequacy >= 100 ? C.green : C.red}
                fontSize={vbW * 0.02}
                fontFamily={C.mono}
                dominantBaseline="middle"
                opacity={0.6}
              >
                min
              </text>
            </>
          )}

          {/* Query point crosshair */}
          {queryResult && (
            <g>
              <line
                x1={queryResult.x_mm} y1={-(maxRAll + padY * 0.4)}
                x2={queryResult.x_mm} y2={maxRAll + padY * 0.4}
                stroke={C.green} strokeWidth={vbW * 0.0015} opacity={0.5}
                strokeDasharray={`${vbW * 0.004} ${vbW * 0.003}`}
              />
              <line
                x1={queryResult.x_mm} y1={-queryResult.r_mm}
                x2={queryResult.x_mm} y2={queryResult.r_mm}
                stroke={C.green} strokeWidth={vbW * 0.003} opacity={0.8}
              />
              <circle cx={queryResult.x_mm} cy={-queryResult.r_mm} r={vbW * 0.006} fill={C.green} opacity={0.9} />
              <circle cx={queryResult.x_mm} cy={queryResult.r_mm} r={vbW * 0.006} fill={C.green} opacity={0.9} />
            </g>
          )}

          {/* Axis labels */}
          <text x={L / 2} y={maxRAll + padY * 0.95} fill={C.textDim} fontSize={vbW * 0.022} textAnchor="middle" fontFamily={C.sans}>
            Axial distance (mm)
          </text>
        </svg>

        {/* Legend */}
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: C.amber }}>● {tLabel}</span>
          {showMultiT && <span style={{ fontSize: 10, color: C.cyan }}>┅ T=0 (cosh) & T=1 (exp)</span>}
          {showConical && <span style={{ fontSize: 10, color: C.blue }}>╌ Conical {conicalAngle}°</span>}
          {showTractrix && <span style={{ fontSize: 10, color: C.magenta }}>┈ Tractrix</span>}
        </div>
      </div>

      {/* ── POINT QUERY ── */}
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: C.textDim, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Section at Position
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ width: 140 }}>
            <NumInput
              label="Axial position"
              value={queryX ?? 0}
              onChange={(v) => setQueryX(v)}
              unit="mm"
              min={0}
              max={effectiveLength_mm}
              step={1}
            />
          </div>
          {queryResult && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", paddingBottom: 10 }}>
              {[
                { label: "Round ⌀", value: `${fmt(queryResult.d_mm, 2)} mm` },
                { label: "Round area", value: `${fmt(queryResult.area_cm2, 3)} cm²` },
                { label: "Square edge", value: `${fmt(queryResult.squareEdge_mm, 2)} mm` },
                { label: "Wall ∠", value: `${fmt(queryResult.wallAngle, 2)}°` },
                { label: "Flare rate", value: `${fmt(queryResult.flareRate, 3)} m⁻¹` },
              ].map((item) => (
                <div key={item.label} style={{
                  background: C.surfaceAlt,
                  border: `1px solid ${C.border}`,
                  borderRadius: 4,
                  padding: "5px 10px",
                  minWidth: 90,
                }}>
                  <div style={{ fontSize: 10, color: C.textDim, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 14, fontFamily: C.mono, fontWeight: 600, color: C.green }}>{item.value}</div>
                </div>
              ))}
            </div>
          )}
          {queryX != null && queryX > effectiveLength_mm && (
            <div style={{ fontSize: 11, color: C.red, paddingBottom: 12 }}>
              Position exceeds horn length ({fmt(effectiveLength_mm, 1)} mm)
            </div>
          )}
        </div>
      </div>

      {/* ── SUMMARY METRICS ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: 8,
          marginBottom: 14,
        }}
      >
        {[
          { label: "Speed of sound", value: `${fmt(c, 1)} m/s`, sub: `at ${temperature}°C` },
          { label: "Flare constant m", value: `${fmt(m, 3)} m⁻¹`, sub: `λ_c = ${fmt(lambda_c * 1000, 1)} mm` },
          { label: "Mouth diameter", value: `${fmt(mouthD_mm, 1)} mm`, sub: `Area: ${fmt(mouthArea_cm2, 1)} cm²` },
          { label: "Min mouth (loading)", value: `${fmt(minMouthDia_loading, 1)} mm`, sub: `circ = λ at f_c`, color: C.textDim },
          {
            label: "Mouth adequacy",
            value: `${fmt(mouthAdequacy, 0)}%`,
            sub: mouthAdequacy >= 100 ? "✓ adequate" : "✗ undersized",
            color: mouthAdequacy >= 100 ? C.green : C.red,
          },
          { label: "Compression ratio", value: `${fmt(compressionRatio, 1)}:1`, sub: `S_mouth / S_throat` },
          { label: "Wall path length", value: `${fmt(wallPathLength_mm, 1)} mm`, sub: `axial: ${fmt(effectiveLength_mm, 1)} mm` },
          {
            label: `Pattern control (${coverageAngle}°)`,
            value: `≥ ${fmt(patternFreq, 0)} Hz`,
            sub: `at mouth ⌀ ${fmt(mouthD_mm, 0)}mm`,
          },
        ].map((item, i) => (
          <div
            key={i}
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 5,
              padding: "8px 10px",
            }}
          >
            <div style={{ fontSize: 10, color: C.textDim, marginBottom: 3 }}>
              {item.label}
            </div>
            <div
              style={{
                fontSize: 15,
                fontFamily: C.mono,
                fontWeight: 600,
                color: item.color || C.text,
              }}
            >
              {item.value}
            </div>
            {item.sub && (
              <div style={{ fontSize: 10, color: item.color || C.textMuted, marginTop: 1 }}>
                {item.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── DATA TABLE ── */}
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          overflow: "hidden",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 12px",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: C.textDim,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Profile Data · {points.length} points
          </span>
          <button
            onClick={exportCSV}
            style={{
              background: C.surfaceAlt,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              color: C.blue,
              fontSize: 11,
              padding: "3px 10px",
              cursor: "pointer",
              fontFamily: C.mono,
            }}
          >
            Export CSV
          </button>
        </div>

        <div style={{ overflowX: "auto", maxHeight: 340 }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontFamily: C.mono,
              fontSize: 12,
            }}
          >
            <thead>
              <tr>
                {[
                  "x (mm)",
                  "⌀ (mm)",
                  "Area (cm²)",
                  "Wall ∠ (°)",
                  "Flare (m⁻¹)",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "right",
                      padding: "6px 10px",
                      borderBottom: `1px solid ${C.borderLight}`,
                      color: C.textDim,
                      fontSize: 10,
                      fontWeight: 500,
                      position: "sticky",
                      top: 0,
                      background: C.surface,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr
                  key={i}
                  style={{
                    background: i % 2 === 0 ? "transparent" : C.bg + "60",
                  }}
                >
                  <td style={{ textAlign: "right", padding: "4px 10px", color: C.text }}>
                    {fmt(p.x_mm, 1)}
                  </td>
                  <td style={{ textAlign: "right", padding: "4px 10px", color: C.amber }}>
                    {fmt(p.d_mm, 2)}
                  </td>
                  <td style={{ textAlign: "right", padding: "4px 10px", color: C.text }}>
                    {fmt(p.area_cm2, 2)}
                  </td>
                  <td style={{ textAlign: "right", padding: "4px 10px", color: C.text }}>
                    {fmt(p.wallAngle, 1)}
                  </td>
                  <td style={{ textAlign: "right", padding: "4px 10px", color: C.textDim }}>
                    {fmt(p.flareRate, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── REFERENCE NOTES ── */}
      <div
        style={{
          fontSize: 10,
          color: C.textMuted,
          lineHeight: 1.6,
          padding: "0 4px",
          fontFamily: C.sans,
        }}
      >
        <strong style={{ color: C.textDim }}>Formulas</strong> ·
        Profile: S(x) = S<sub>t</sub>·(cosh(mx) + T·sinh(mx))² where m = 2πf<sub>c</sub>/c ·
        Loading cutoff: mouth circumference = λ<sub>c</sub> →
        D<sub>min</sub> = c/(πf<sub>c</sub>) ·
        Pattern control: f<sub>lower</sub> ≈ c/(D·sin(θ/2)) ·
        Tractrix: tangent length = R<sub>mouth</sub> = 1/m, fixed geometry ·
        Wall angle: θ = arctan(dr/dx) ·
        Flare rate: (1/S)(dS/dx)
        <br />
        <strong style={{ color: C.textDim }}>T parameter</strong> ·
        T=0: hyperbolic (cosh²) — fastest initial flare, smoothest throat loading ·
        T=1: exponential — constant flare rate, classic reference ·
        0&lt;T&lt;1: intermediate family blending both characteristics
      </div>
    </div>
  );
}
