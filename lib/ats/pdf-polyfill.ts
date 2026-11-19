// Headless-runtime polyfills for pdfjs-dist (used by pdf-parse). Import this module (side effect only)
// before any dynamic `import("pdf-parse")` so DOMMatrix/Path2D/ImageData exist in Node/serverless.
const g = globalThis as unknown as Record<string, unknown>;
if (typeof g.DOMMatrix === "undefined") g.DOMMatrix = class DOMMatrix {};
if (typeof g.Path2D === "undefined") g.Path2D = class Path2D {};
if (typeof g.ImageData === "undefined") g.ImageData = class ImageData {};

export {};
