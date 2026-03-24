import { useRef, useEffect } from 'react';
import { generateAllRotations, renderGridToCanvas, gridToPngDataUrl, downloadPng } from '../../spriteEditor/spriteUtils';
import styles from './RotationPreview.module.css';

/**
 * Shows live previews of all 6 hex rotations (60° increments).
 * Each preview has its own download button.
 *
 * Props:
 *   grid     – the source 32×32 grid
 *   baseName – filename prefix for downloads (default "sprite")
 */
export function RotationPreview({ grid, baseName = 'sprite' }) {
  const rotations = generateAllRotations(grid);

  return (
    <div className={styles.wrap}>
      <h3 className={styles.heading}>Hex Rotations</h3>
      <div className={styles.grid}>
        {rotations.map(({ angle, grid: rGrid }) => (
          <PreviewTile
            key={angle}
            angle={angle}
            grid={rGrid}
            baseName={baseName}
          />
        ))}
      </div>
      <button
        className={styles.downloadAll}
        onClick={() => {
          rotations.forEach(({ angle, grid: rGrid }) => {
            downloadPng(gridToPngDataUrl(rGrid), `${baseName}-${angle}.png`);
          });
        }}
      >
        Download All 6
      </button>
    </div>
  );
}

function PreviewTile({ angle, grid, baseName }) {
  const ref = useRef(null);
  const previewPixel = 2; // each cell = 2px on the preview canvas

  useEffect(() => {
    if (ref.current) {
      renderGridToCanvas(ref.current, grid, previewPixel, false);
    }
  }, [grid]);

  return (
    <div className={styles.tile}>
      <canvas
        ref={ref}
        className={styles.preview}
        style={{ width: 64, height: 64 }}
      />
      <span className={styles.label}>{angle}°</span>
      <button
        className={styles.dlBtn}
        onClick={() =>
          downloadPng(gridToPngDataUrl(grid), `${baseName}-${angle}.png`)
        }
      >
        Save
      </button>
    </div>
  );
}
