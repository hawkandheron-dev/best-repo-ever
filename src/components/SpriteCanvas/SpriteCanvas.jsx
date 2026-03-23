import { useRef, useEffect, useCallback } from 'react';
import { renderGridToCanvas } from '../../spriteEditor/spriteUtils';
import styles from './SpriteCanvas.module.css';

/**
 * 32×32 pixel-art drawing canvas.
 *
 * Props:
 *   grid        – 32×32 2-D array (null = transparent, string = colour)
 *   onGridChange – (newGrid) => void
 *   color       – current drawing colour (hex string)
 *   tool        – 'pencil' | 'eraser'
 *   showGrid    – whether to render grid lines
 */
export function SpriteCanvas({ grid, onGridChange, color, tool, showGrid }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const GRID_SIZE = grid.length;

  // Pick a pixel-size that fills ~320 px on screen.
  const pixelSize = Math.floor(320 / GRID_SIZE);

  // Re-render whenever grid, showGrid, or pixelSize change.
  useEffect(() => {
    if (canvasRef.current) {
      renderGridToCanvas(canvasRef.current, grid, pixelSize, showGrid);
    }
  }, [grid, pixelSize, showGrid]);

  const paint = useCallback(
    (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      const col = Math.floor(x / pixelSize);
      const row = Math.floor(y / pixelSize);
      if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return;

      const value = tool === 'eraser' ? null : color;
      if (grid[row][col] === value) return; // no-op

      const next = grid.map((r) => [...r]);
      next[row][col] = value;
      onGridChange(next);
    },
    [grid, onGridChange, color, tool, pixelSize, GRID_SIZE],
  );

  const onPointerDown = useCallback(
    (e) => {
      e.preventDefault();
      drawing.current = true;
      canvasRef.current?.setPointerCapture(e.pointerId);
      paint(e);
    },
    [paint],
  );

  const onPointerMove = useCallback(
    (e) => {
      if (drawing.current) paint(e);
    },
    [paint],
  );

  const onPointerUp = useCallback(() => {
    drawing.current = false;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      style={{ width: pixelSize * GRID_SIZE, height: pixelSize * GRID_SIZE }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    />
  );
}
