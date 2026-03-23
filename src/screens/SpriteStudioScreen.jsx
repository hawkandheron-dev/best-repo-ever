import { useState, useCallback, useRef } from 'react';
import { createEmptyGrid, cloneGrid, gridToPngDataUrl, downloadPng } from '../spriteEditor/spriteUtils';
import { SpriteCanvas } from '../components/SpriteCanvas/SpriteCanvas';
import { GradientColorPicker } from '../components/SpriteCanvas/GradientColorPicker';
import styles from './SpriteStudioScreen.module.css';

const MAX_HISTORY = 80;
const MAX_RECENT = 50;

export function SpriteStudioScreen({ onBack }) {
  const [grid, setGrid] = useState(() => createEmptyGrid());
  const [color, setColor] = useState('#ffffff');
  const [tool, setTool] = useState('pencil');
  const [showGrid, setShowGrid] = useState(true);
  const [zoom, setZoom] = useState(10);
  const [recentColors, setRecentColors] = useState([]);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 2, 24)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 2, 4)), []);

  // Undo / redo stacks.
  const undoStack = useRef([]);
  const redoStack = useRef([]);

  /** Track the current color + tool at paint-time via a ref. */
  const colorRef = useRef(color);
  colorRef.current = color;
  const toolRef = useRef(tool);
  toolRef.current = tool;

  /** Add a colour to the recent list (most-recent first, no duplicates). */
  const addRecent = useCallback((hex) => {
    setRecentColors((prev) => {
      const next = prev.filter((c) => c !== hex);
      next.unshift(hex);
      if (next.length > MAX_RECENT) next.pop();
      return next;
    });
  }, []);

  const pushGrid = useCallback(
    (nextGrid) => {
      setGrid((prev) => {
        undoStack.current.push(cloneGrid(prev));
        if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
        redoStack.current = [];
        return nextGrid;
      });
      // A grid change from pencil/fill means this color was actually used to draw.
      const t = toolRef.current;
      if (t === 'pencil' || t === 'fill') {
        addRecent(colorRef.current);
      }
    },
    [addRecent],
  );

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    setGrid((prev) => {
      redoStack.current.push(cloneGrid(prev));
      return undoStack.current.pop();
    });
  }, []);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    setGrid((prev) => {
      undoStack.current.push(cloneGrid(prev));
      return redoStack.current.pop();
    });
  }, []);

  const clearCanvas = useCallback(() => {
    pushGrid(createEmptyGrid());
  }, [pushGrid]);

  const savePng = useCallback(() => {
    downloadPng(gridToPngDataUrl(grid));
  }, [grid]);

  /** Called by the canvas when dropper picks a colour from a pixel. */
  const onPickColor = useCallback((hex) => {
    setColor(hex);
    setTool('pencil');
  }, []);

  /** Select color from picker or recent swatch (just sets color, no recent tracking). */
  const selectColor = useCallback((hex) => {
    setColor(hex);
    setTool('pencil');
  }, []);

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>
          &larr; Menu
        </button>
        <h1 className={styles.title}>Sprite Studio</h1>
      </div>

      {/* Drawing canvas */}
      <SpriteCanvas
        grid={grid}
        onGridChange={pushGrid}
        color={color}
        tool={tool}
        showGrid={showGrid}
        pixelSize={zoom}
        onPickColor={onPickColor}
      />

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <button
          className={`${styles.toolBtn} ${tool === 'pencil' ? styles.active : ''}`}
          onClick={() => setTool('pencil')}
        >
          Pencil
        </button>
        <button
          className={`${styles.toolBtn} ${tool === 'eraser' ? styles.active : ''}`}
          onClick={() => setTool('eraser')}
        >
          Eraser
        </button>
        <button
          className={`${styles.toolBtn} ${tool === 'fill' ? styles.active : ''}`}
          onClick={() => setTool('fill')}
        >
          Fill
        </button>
        <button
          className={`${styles.toolBtn} ${tool === 'dropper' ? styles.active : ''}`}
          onClick={() => setTool('dropper')}
        >
          Dropper
        </button>
        <button className={styles.toolBtn} onClick={clearCanvas}>
          Clear
        </button>
        <button
          className={`${styles.toolBtn} ${showGrid ? styles.active : ''}`}
          onClick={() => setShowGrid((g) => !g)}
        >
          Grid
        </button>
      </div>

      {/* Undo / Redo / Zoom */}
      <div className={styles.toolbar}>
        <button className={styles.toolBtn} onClick={undo}>
          Undo
        </button>
        <button className={styles.toolBtn} onClick={redo}>
          Redo
        </button>
        <span className={styles.separator} />
        <button className={styles.toolBtn} onClick={zoomOut}>
          &minus;
        </button>
        <span className={styles.zoomLabel}>{Math.round((zoom / 10) * 100)}%</span>
        <button className={styles.toolBtn} onClick={zoomIn}>
          +
        </button>
        <span className={styles.separator} />
        <button className={styles.toolBtn} onClick={savePng}>
          Save PNG
        </button>
      </div>

      {/* Colour picker + recent colours */}
      <div className={styles.pickerRow}>
        {recentColors.length > 0 && (
          <div className={styles.recentSidebar}>
            <span className={styles.recentLabel}>Recent</span>
            <div className={styles.recentList}>
              {recentColors.map((c) => (
                <button
                  key={c}
                  className={`${styles.recentSwatch} ${c === color ? styles.recentActive : ''}`}
                  style={{ background: c }}
                  onClick={() => selectColor(c)}
                />
              ))}
            </div>
          </div>
        )}
        <GradientColorPicker
          color={color}
          onChange={selectColor}
        />
      </div>
    </div>
  );
}
