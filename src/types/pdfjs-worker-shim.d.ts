// Minimal ambient declaration for the pdf.js worker module (R-C4). The main
// pdf.js API ships its own types; only the worker entry (imported purely to
// register pdf.js's main-thread `globalThis.pdfjsWorker` hook) needs one.
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
