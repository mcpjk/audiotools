import { createCompute } from './compute.js';

const compute = createCompute();
self.onmessage = ({ data: { id, type, key, payload } }) => {
  try {
    const result = compute(type, key, payload);
    const transfer = result?.buffer instanceof ArrayBuffer ? [result.buffer] : [];
    self.postMessage({ id, key, result }, transfer);
  } catch (error) {
    self.postMessage({ id, key, error: error.message || String(error) });
  }
};
