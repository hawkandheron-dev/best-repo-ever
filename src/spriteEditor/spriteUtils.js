/** Sprite editor utilities — rotation, export, download. */

const GRID_SIZE = 32;

/** Create a GRID_SIZE×GRID_SIZE 2-D array filled with null (transparent). */
export function createEmptyGrid(size = GRID_SIZE) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

/** Deep-clone a grid. */
export function cloneGrid(grid) {
  return grid.map((row) => [...row]);
}

/* ── Flood fill ──────────────────────────────────────────────────────────── */

/**
 * Flood-fill from (startRow, startCol) with `fillColor`.
 * Returns a new grid (does not mutate the input).
 */
export function floodFill(grid, startRow, startCol, fillColor) {
  const size = grid.length;
  const target = grid[startRow][startCol]; // colour being replaced (or null)
  if (target === fillColor) return grid;   // already that colour

  const out = grid.map((r) => [...r]);
  const stack = [[startRow, startCol]];

  while (stack.length > 0) {
    const [r, c] = stack.pop();
    if (r < 0 || r >= size || c < 0 || c >= size) continue;
    if (out[r][c] !== target) continue;
    out[r][c] = fillColor;
    stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
  }
  return out;
}

/* ── Rotation ────────────────────────────────────────────────────────────── */

/**
 * Rotate a pixel grid by `angleDeg` degrees (clockwise) using an offscreen
 * canvas.  Returns a new GRID_SIZE×GRID_SIZE grid.
 */
function rotateGridByAngle(grid, angleDeg) {
  const size = grid.length;
  // Paint source pixels onto a canvas.
  const src = new OffscreenCanvas(size, size);
  const sCtx = src.getContext('2d');
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c]) {
        sCtx.fillStyle = grid[r][c];
        sCtx.fillRect(c, r, 1, 1);
      }
    }
  }

  // Draw onto a second canvas, rotated around the centre.
  const dst = new OffscreenCanvas(size, size);
  const dCtx = dst.getContext('2d');
  const half = size / 2;
  dCtx.translate(half, half);
  dCtx.rotate((angleDeg * Math.PI) / 180);
  dCtx.translate(-half, -half);
  dCtx.drawImage(src, 0, 0);

  // Read back pixel data.
  const imgData = dCtx.getImageData(0, 0, size, size);
  const out = createEmptyGrid(size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = (r * size + c) * 4;
      const a = imgData.data[i + 3];
      if (a > 0) {
        const red = imgData.data[i];
        const grn = imgData.data[i + 1];
        const blu = imgData.data[i + 2];
        out[r][c] =
          `rgba(${red},${grn},${blu},${(a / 255).toFixed(2)})`;
      }
    }
  }
  return out;
}

/**
 * Generate all 6 hex rotations (0°, 60°, 120°, 180°, 240°, 300°).
 * Returns an array of { angle, grid } objects.
 */
export function generateAllRotations(grid) {
  return [0, 60, 120, 180, 240, 300].map((angle) => ({
    angle,
    grid: angle === 0 ? cloneGrid(grid) : rotateGridByAngle(grid, angle),
  }));
}

/* ── Canvas / PNG export ─────────────────────────────────────────────────── */

/**
 * Render a grid onto a visible <canvas> element.
 * `pixelSize` is how many screen-pixels each grid cell occupies.
 * If `showGrid` is true, thin lines are drawn between cells.
 */
export function renderGridToCanvas(canvas, grid, pixelSize, showGrid) {
  const ctx = canvas.getContext('2d');
  const size = grid.length;
  const total = size * pixelSize;
  canvas.width = total;
  canvas.height = total;

  // Transparent background.
  ctx.clearRect(0, 0, total, total);

  // Draw checkerboard transparency pattern.
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const x = c * pixelSize;
      const y = r * pixelSize;
      ctx.fillStyle = (r + c) % 2 === 0 ? '#2a2a2a' : '#222';
      ctx.fillRect(x, y, pixelSize, pixelSize);
      if (grid[r][c]) {
        ctx.fillStyle = grid[r][c];
        ctx.fillRect(x, y, pixelSize, pixelSize);
      }
    }
  }

  // Grid overlay — use dark lines so they stay visible on light fills.
  if (showGrid) {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= size; i++) {
      const pos = i * pixelSize;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, total);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(total, pos);
      ctx.stroke();
    }
  }
}

/** Export a grid as a PNG data-URL (32×32 actual pixels). */
export function gridToPngDataUrl(grid) {
  const size = grid.length;
  const cvs = new OffscreenCanvas(size, size);
  const ctx = cvs.getContext('2d');
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c]) {
        ctx.fillStyle = grid[r][c];
        ctx.fillRect(c, r, 1, 1);
      }
    }
  }
  // OffscreenCanvas → Blob → data-URL via helper canvas
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  out.getContext('2d').drawImage(cvs, 0, 0);
  return out.toDataURL('image/png');
}

/**
 * Load an image file (PNG, JPEG, etc.) into a GRID_SIZE×GRID_SIZE grid.
 * Images larger than GRID_SIZE are scaled down proportionally to fit.
 * Returns a Promise that resolves to a 2-D grid array.
 */
export function pngToGrid(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.onload = () => {
        // Determine target size: scale down to fit GRID_SIZE, or use native size if small enough.
        const scale = Math.min(1, GRID_SIZE / img.width, GRID_SIZE / img.height);
        const w = Math.round(img.width * scale) || 1;
        const h = Math.round(img.height * scale) || 1;

        const cvs = document.createElement('canvas');
        cvs.width = w;
        cvs.height = h;
        const ctx = cvs.getContext('2d');
        ctx.imageSmoothingEnabled = w < img.width; // smooth when downscaling
        ctx.drawImage(img, 0, 0, w, h);

        const imgData = ctx.getImageData(0, 0, w, h);
        const grid = createEmptyGrid();

        // Centre the image in the grid.
        const offR = Math.floor((GRID_SIZE - h) / 2);
        const offC = Math.floor((GRID_SIZE - w) / 2);

        for (let r = 0; r < h; r++) {
          for (let c = 0; c < w; c++) {
            const i = (r * w + c) * 4;
            const a = imgData.data[i + 3];
            if (a > 0) {
              const red = imgData.data[i];
              const grn = imgData.data[i + 1];
              const blu = imgData.data[i + 2];
              grid[r + offR][c + offC] =
                a === 255
                  ? `#${red.toString(16).padStart(2, '0')}${grn.toString(16).padStart(2, '0')}${blu.toString(16).padStart(2, '0')}`
                  : `rgba(${red},${grn},${blu},${(a / 255).toFixed(2)})`;
            }
          }
        }
        resolve(grid);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Trigger a browser download for the given data-URL. */
export function downloadPng(dataUrl, filename = 'sprite.png') {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
