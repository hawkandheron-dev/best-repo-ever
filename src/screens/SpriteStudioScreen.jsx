import { useState } from 'react';
import { createEmptyGrid } from '../spriteEditor/spriteUtils';
import { SpriteCanvas } from '../components/SpriteCanvas/SpriteCanvas';
import { RotationPreview } from '../components/SpriteCanvas/RotationPreview';
import styles from './SpriteStudioScreen.module.css';

const PRESETS = [
  '#000000', '#ffffff', '#ff0000', '#00aa00',
  '#3366ff', '#ffcc00', '#8b4513', '#888888',
  '#aa00cc', '#ff6600',
];

export function SpriteStudioScreen({ onBack }) {
  const [grid, setGrid] = useState(() => createEmptyGrid());
  const [color, setColor] = useState('#ffffff');
  const [tool, setTool] = useState('pencil');   // 'pencil' | 'eraser'
  const [showGrid, setShowGrid] = useState(true);

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
        onGridChange={setGrid}
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
        <button
          className={styles.toolBtn}
          onClick={() => setGrid(createEmptyGrid())}
        >
          Clear
        </button>
        <button
          className={`${styles.toolBtn} ${showGrid ? styles.active : ''}`}
          onClick={() => setShowGrid((g) => !g)}
        >
          Grid
        </button>
      </div>

      {/* Colour picker */}
      <div className={styles.colorRow}>
        <input
          type="color"
          value={color}
          onChange={(e) => {
            setColor(e.target.value);
            setTool('pencil');
          }}
          className={styles.colorInput}
        />
        {PRESETS.map((c) => (
          <button
            key={c}
            className={`${styles.swatch} ${color === c && tool === 'pencil' ? styles.activeSwatch : ''}`}
            style={{ background: c }}
            onClick={() => {
              setColor(c);
              setTool('pencil');
            }}
          />
        ))}
      </div>

      {/* 6-direction rotation previews */}
      <RotationPreview grid={grid} />
    </div>
  );
}
