import { useState, useCallback, useRef } from 'react';
import { createEmptyGrid, cloneGrid } from '../spriteEditor/spriteUtils';
import { SpriteCanvas } from '../components/SpriteCanvas/SpriteCanvas';
import { RotationPreview } from '../components/SpriteCanvas/RotationPreview';
import { GradientColorPicker } from '../components/SpriteCanvas/GradientColorPicker';
import styles from './SpriteStudioScreen.module.css';

const MAX_HISTORY = 80;

export function SpriteStudioScreen({ onBack }) {
  const [grid, setGrid] = useState(() => createEmptyGrid());
  const [color, setColor] = useState('#ffffff');
  const [tool, setTool] = useState('pencil');   // 'pencil' | 'eraser'
  const [showGrid, setShowGrid] = useState(true);

  // Undo / redo stacks (store grid snapshots).
  const undoStack = useRef([]);
  const redoStack = useRef([]);

  /** Wrap setGrid so every external change pushes onto the undo stack. */
  const pushGrid = useCallback(
    (nextGrid) => {
      setGrid((prev) => {
        undoStack.current.push(cloneGrid(prev));
        if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
        redoStack.current = []; // new change clears redo
        return nextGrid;
      });
    },
    [],
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

      {/* Undo / Redo */}
      <div className={styles.toolbar}>
        <button className={styles.toolBtn} onClick={undo}>
          Undo
        </button>
        <button className={styles.toolBtn} onClick={redo}>
          Redo
        </button>
      </div>

      {/* Gradient colour picker */}
      <GradientColorPicker
        color={color}
        onChange={(hex) => {
          setColor(hex);
          setTool('pencil');
        }}
      />

      {/* 6-direction rotation previews */}
      <RotationPreview grid={grid} />
    </div>
  );
}
