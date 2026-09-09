// Exact canonical keys are used for equality, avoiding hash-collision aliases.
// No rounding: two settings that move a surface must never share a cache entry.
export const DESIGN_SCHEMA = 1;
export const MODEL_REVISION = typeof __GINKGO_RIM_REVISION__ === 'string'
  ? __GINKGO_RIM_REVISION__ : 'development';

export function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Design settings must be finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  throw new Error('Design state must contain plain JSON values');
}

export const designKey = value => canonical({ schema: DESIGN_SCHEMA, model: MODEL_REVISION, value });

export function designStamp(state) {
  return `GINKGO_DESIGN_V${DESIGN_SCHEMA}=${canonical({ schema: DESIGN_SCHEMA, model: MODEL_REVISION, ...state })}`;
}

// Accept either the stamp itself or a complete STEP file (STEP escapes apostrophes).
export function readDesignStamp(text) {
  const prefix = `GINKGO_DESIGN_V${DESIGN_SCHEMA}=`;
  const start = text.indexOf(prefix);
  if (start < 0) throw new Error('No supported Ginkgo design stamp');
  let json = text.slice(start + prefix.length);
  if (text.startsWith('ISO-10303-21')) json = json.replace(/''/g, "'");
  // Stop at the balanced JSON object, ignoring braces inside quoted strings.
  let depth = 0, quoted = false, escape = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (quoted) { if (escape) escape = false; else if (ch === '\\') escape = true; else if (ch === '"') quoted = false; }
    else if (ch === '"') quoted = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      const state = JSON.parse(json.slice(0, i + 1));
      if (state.schema !== DESIGN_SCHEMA) throw new Error('Unsupported design schema');
      return state;
    }
  }
  throw new Error('Incomplete Ginkgo design stamp');
}

export function convergence(a, b) {
  const delta = (x, y) => x === y ? 0 : Math.abs(x - y);
  const foldMm = delta(a.bendFoldMin, b.bendFoldMin);
  const passage = delta(a.fluxContractMax, b.fluxContractMax);
  const tiltDeg = delta(a.sectionObliqMax, b.sectionObliqMax);
  return { foldMm, passage, tiltDeg,
    stable: foldMm <= Math.max(0.02, 0.01 * Math.abs(b.bendFoldMin))
      && passage <= 0.001 && tiltDeg <= 0.1 };
}
