import { useRef, useEffect, useCallback } from 'react';
import { renderGridToCanvas, floodFill } from '../../spriteEditor/spriteUtils';
import styles from './SpriteCanvas.module.css';

/**
 * 32×32 pixel-art drawing canvas.
 *
 * Props:
 *   grid        – 32×32 2-D array (null = transparent, string = colour)
 *   onGridChange – (newGrid) => void
 *   color       – current drawing colour (hex string)
 *   tool        – 'pencil' | 'eraser' | 'fill'
 *   showGrid    – whether to render grid lines
 *   pixelSize   – screen-pixels per grid cell
 */
export function SpriteCanvas({ grid, onGridChange, color, tool, showGrid, pixelSize, onPickColor }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const GRID_SIZE = grid.length;

  useEffect(() => {
    if (canvasRef.current) {
      renderGridToCanvas(canvasRef.current, grid, pixelSize, showGrid);
    }
  }, [grid, pixelSize, showGrid]);

  const cellFromEvent = useCallback(
    (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      const col = Math.floor(x / pixelSize);
      const row = Math.floor(y / pixelSize);
      if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
      return { row, col };
    },
    [pixelSize, GRID_SIZE],
  );

  const paint = useCallback(
    (e) => {
      const cell = cellFromEvent(e);
      if (!cell) return;
      const { row, col } = cell;

      if (tool === 'dropper') {
        const picked = grid[row][col];
        if (picked && onPickColor) onPickColor(picked);
        return;
      }

      if (tool === 'fill') {
        const fillColor = color;
        const next = floodFill(grid, row, col, fillColor);
        if (next !== grid) onGridChange(next);
        return;
      }

      const value = tool === 'eraser' ? null : color;
      if (grid[row][col] === value) return;

      const next = grid.map((r) => [...r]);
      next[row][col] = value;
      onGridChange(next);
    },
    [grid, onGridChange, color, tool, cellFromEvent],
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
      // Don't drag-paint with fill/dropper — one click is enough.
      if (drawing.current && tool !== 'fill' && tool !== 'dropper') paint(e);
    },
    [paint, tool],
  );

  const onPointerUp = useCallback(() => {
    drawing.current = false;
  }, []);

  const totalPx = pixelSize * GRID_SIZE;

  return (
    <div className={styles.canvasWrap}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ width: totalPx, height: totalPx }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
    </div>
  );
}
