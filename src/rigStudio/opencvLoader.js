/**
 * Lazy loader for OpenCV.js, used only by the Rig Studio's smart-cutout assist.
 *
 * Three rules this module exists to enforce:
 *
 *  1. It is NEVER imported by the game. OpenCV is ~9 MB of wasm; a player who
 *     never opens the editor must never download it. `vite.config.js` also keeps
 *     it out of the service worker precache.
 *  2. It is loaded on demand, behind an explicit button, once.
 *  3. It is allowed to fail. The manual polygon lasso is the primary cutting path
 *     and must work with OpenCV absent — offline, blocked, or CDN down. A dead
 *     network must not mean a dead tool.
 */

const CDN_URL = 'https://docs.opencv.org/4.10.0/opencv.js';
/** Prefer a vendored copy if one has been dropped in; fall back to the CDN. */
const LOCAL_URL = '/vendor/opencv/opencv.js';

let pending = null;

export const OPENCV_STATE = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  FAILED: 'failed',
};

function injectScript(src) {
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = src;
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error(`Could not fetch ${src}`));
    document.head.appendChild(tag);
  });
}

function waitForRuntime(timeoutMs) {
  return new Promise((resolve, reject) => {
    const cv = window.cv;
    if (!cv) {
      reject(new Error('OpenCV script loaded but window.cv is missing'));
      return;
    }
    // Depending on build, `cv` is either ready or a promise-like awaiting wasm.
    if (typeof cv.grabCut === 'function') {
      resolve(cv);
      return;
    }
    const timer = setTimeout(() => reject(new Error('OpenCV wasm did not initialise in time')), timeoutMs);
    if (typeof cv.then === 'function') {
      cv.then((ready) => {
        clearTimeout(timer);
        window.cv = ready;
        resolve(ready);
      }).catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
    } else {
      cv.onRuntimeInitialized = () => {
        clearTimeout(timer);
        resolve(window.cv);
      };
    }
  });
}

/**
 * Load OpenCV once, returning the `cv` namespace.
 * Concurrent callers share one in-flight promise; a failure clears it so a later
 * retry can genuinely try again rather than replaying the cached rejection.
 */
export function loadOpenCV({ timeoutMs = 30000 } = {}) {
  if (window.cv && typeof window.cv.grabCut === 'function') return Promise.resolve(window.cv);
  if (pending) return pending;

  pending = (async () => {
    try {
      await injectScript(LOCAL_URL);
    } catch {
      await injectScript(CDN_URL);
    }
    return waitForRuntime(timeoutMs);
  })();

  pending.catch(() => {
    pending = null;
  });

  return pending;
}

/**
 * Refine a rectangular selection into a foreground mask with GrabCut.
 *
 * GrabCut is a graph-cut algorithm from 2004, not a neural network — it separates
 * foreground from background using colour statistics seeded by the rectangle. It
 * struggles where foreground and background share a palette, which is exactly the
 * case for marble on marble, so the lasso remains the reliable path for busts.
 * Frescoes, where robes are saturated against masonry, are where it earns its keep.
 *
 * @returns {Uint8Array} one byte per pixel, non-zero meaning foreground
 */
export async function grabCutRect(sourceCanvas, rect, { iterations = 4 } = {}) {
  const cv = await loadOpenCV();
  const { width, height } = sourceCanvas;
  const imageData = sourceCanvas.getContext('2d').getImageData(0, 0, width, height);

  const src = cv.matFromImageData(imageData);
  const rgb = new cv.Mat();
  cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);

  const mask = new cv.Mat();
  const bgdModel = new cv.Mat();
  const fgdModel = new cv.Mat();
  const roi = new cv.Rect(
    Math.max(0, Math.round(rect.x)),
    Math.max(0, Math.round(rect.y)),
    Math.min(width - Math.round(rect.x), Math.round(rect.width)),
    Math.min(height - Math.round(rect.y), Math.round(rect.height)),
  );

  try {
    cv.grabCut(rgb, mask, roi, bgdModel, fgdModel, iterations, cv.GC_INIT_WITH_RECT);

    const out = new Uint8Array(width * height);
    for (let i = 0; i < out.length; i++) {
      const v = mask.data[i];
      // GC_FGD (1) and GC_PR_FGD (3) are foreground; 0 and 2 are background.
      out[i] = v === cv.GC_FGD || v === cv.GC_PR_FGD ? 255 : 0;
    }
    return out;
  } finally {
    src.delete();
    rgb.delete();
    mask.delete();
    bgdModel.delete();
    fgdModel.delete();
  }
}
