import { useRef, useCallback, useEffect, useState } from 'react';
import styles from './GradientColorPicker.module.css';

/**
 * Square gradient color picker (HSV model).
 *
 * - Top strip: hue slider (rainbow gradient)
 * - Square area: saturation (left→right) × value (top→bottom)
 * - Displays current colour + hex input
 *
 * Props:
 *   color    – current hex colour string
 *   onChange – (hex: string) => void
 */
export function GradientColorPicker({ color, onChange }) {
  const [hue, setHue] = useState(() => hexToHsv(color).h);
  const [sat, setSat] = useState(() => hexToHsv(color).s);
  const [val, setVal] = useState(() => hexToHsv(color).v);
  const [hexInput, setHexInput] = useState(color);

  const squareRef = useRef(null);
  const hueRef = useRef(null);
  const draggingSquare = useRef(false);
  const draggingHue = useRef(false);

  // Sync outward whenever h/s/v change.
  useEffect(() => {
    const hex = hsvToHex(hue, sat, val);
    setHexInput(hex);
    onChange(hex);
  }, [hue, sat, val]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync inward when color prop changes externally.
  useEffect(() => {
    const { h, s, v } = hexToHsv(color);
    if (hsvToHex(hue, sat, val) !== color) {
      setHue(h);
      setSat(s);
      setVal(v);
      setHexInput(color);
    }
  }, [color]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Square drag (saturation + value) ─────────────────────────────── */
  const updateSquare = useCallback(
    (e) => {
      const rect = squareRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
      setSat(x / rect.width);
      setVal(1 - y / rect.height);
    },
    [],
  );

  const onSquareDown = useCallback(
    (e) => {
      e.preventDefault();
      draggingSquare.current = true;
      squareRef.current?.setPointerCapture(e.pointerId);
      updateSquare(e);
    },
    [updateSquare],
  );

  const onSquareMove = useCallback(
    (e) => {
      if (draggingSquare.current) updateSquare(e);
    },
    [updateSquare],
  );

  const onSquareUp = useCallback(() => {
    draggingSquare.current = false;
  }, []);

  /* ── Hue strip drag ───────────────────────────────────────────────── */
  const updateHue = useCallback((e) => {
    const rect = hueRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setHue((x / rect.width) * 360);
  }, []);

  const onHueDown = useCallback(
    (e) => {
      e.preventDefault();
      draggingHue.current = true;
      hueRef.current?.setPointerCapture(e.pointerId);
      updateHue(e);
    },
    [updateHue],
  );

  const onHueMove = useCallback(
    (e) => {
      if (draggingHue.current) updateHue(e);
    },
    [updateHue],
  );

  const onHueUp = useCallback(() => {
    draggingHue.current = false;
  }, []);

  /* ── Hex input ────────────────────────────────────────────────────── */
  const onHexCommit = useCallback(() => {
    const cleaned = hexInput.startsWith('#') ? hexInput : `#${hexInput}`;
    if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) {
      const { h, s, v } = hexToHsv(cleaned);
      setHue(h);
      setSat(s);
      setVal(v);
    } else {
      setHexInput(hsvToHex(hue, sat, val));
    }
  }, [hexInput, hue, sat, val]);

  const pureHueHex = hsvToHex(hue, 1, 1);

  return (
    <div className={styles.picker}>
      {/* SV square */}
      <div
        ref={squareRef}
        className={styles.square}
        style={{ background: pureHueHex }}
        onPointerDown={onSquareDown}
        onPointerMove={onSquareMove}
        onPointerUp={onSquareUp}
        onPointerLeave={onSquareUp}
      >
        <div className={styles.satOverlay} />
        <div className={styles.valOverlay} />
        <div
          className={styles.cursor}
          style={{ left: `${sat * 100}%`, top: `${(1 - val) * 100}%` }}
        />
      </div>

      {/* Hue strip */}
      <div
        ref={hueRef}
        className={styles.hueStrip}
        onPointerDown={onHueDown}
        onPointerMove={onHueMove}
        onPointerUp={onHueUp}
        onPointerLeave={onHueUp}
      >
        <div
          className={styles.hueThumb}
          style={{ left: `${(hue / 360) * 100}%` }}
        />
      </div>

      {/* Preview + hex */}
      <div className={styles.infoRow}>
        <div
          className={styles.preview}
          style={{ background: hsvToHex(hue, sat, val) }}
        />
        <input
          className={styles.hexInput}
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          onBlur={onHexCommit}
          onKeyDown={(e) => e.key === 'Enter' && onHexCommit()}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

/* ── HSV ↔ Hex helpers ──────────────────────────────────────────────── */

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function hsvToHex(h, s, v) {
  const [r, g, b] = hsvToRgb(h, s, v);
  return (
    '#' +
    [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')
  );
}

function hexToHsv(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}
