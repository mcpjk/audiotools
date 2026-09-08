// A lane owns at most one job. Termination cancels CPU work, not just its reply.
// Keeping independent lanes lets the preview paint while diagnostics are running.
export class WorkerLane {
  constructor(factory = () => new Worker(new URL('./ginkgo-worker.js', import.meta.url), { type: 'module' })) {
    this.factory = factory;
    this.serial = 0;
  }
  cancel() {
    if (this.pending) {
      this.pending.reject(new DOMException('Calculation cancelled', 'AbortError'));
      this.pending = null;
      this.worker?.terminate();
      this.worker = null;
    }
  }
  dispose() { this.cancel(); this.worker?.terminate(); this.worker = null; }
  run(type, key, payload) {
    this.cancel();
    const worker = this.worker ||= this.factory();
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      this.pending = { id, reject };
      worker.onmessage = ({ data }) => {
        if (this.pending?.id !== id || data.id !== id || data.key !== key) return;
        this.pending = null;
        data.error ? reject(new Error(data.error)) : resolve(data.result);
      };
      worker.onerror = event => {
        event.preventDefault?.();
        if (this.pending?.id !== id) return;
        this.pending = null;
        this.worker?.terminate(); this.worker = null;
        reject(new Error(event.message || 'Calculation worker failed'));
      };
      try { worker.postMessage({ id, type, key, payload }); }
      catch (error) { this.pending = null; reject(error); }
    });
  }
}
