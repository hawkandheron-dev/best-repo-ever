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

  // Grid overlay.
  if (showGrid) {
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
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

/** Trigger a browser download for the given data-URL. */
export function downloadPng(dataUrl, filename = 'sprite.png') {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
