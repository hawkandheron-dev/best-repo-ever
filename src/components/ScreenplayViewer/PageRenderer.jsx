import { useRef, useEffect } from 'react';
import { renderPage } from '../../screenplay/pdfLoader';
import styles from './PageRenderer.module.css';

// Groups text-layer spans by their y-coordinate (top-to-bottom order).
function buildLineGroups(textLayerEl) {
  const spans = Array.from(textLayerEl.querySelectorAll('span'));
  const groups = [];
  let currentY = null;
  let currentGroup = [];

  // Each span has an inline transform: matrix(...) or translate(...) style.
  for (const span of spans) {
    const transform = span.style.transform || span.style.webkitTransform || '';
    // Extract translateY value from matrix(a,b,c,d,tx,ty) or translate(tx, ty).
    let y = null;
    const matrixMatch = transform.match(/matrix\([^)]+,\s*([\d.+-]+)\)$/);
    const translateMatch = transform.match(/translate\([^,]+,\s*([\d.+-]+)/);
    if (matrixMatch) y = parseFloat(matrixMatch[1]);
    else if (translateMatch) y = parseFloat(translateMatch[1]);
    else {
      // Fall back to bounding rect.
      y = span.getBoundingClientRect().top;
    }

    if (currentY === null || Math.abs(y - currentY) > 4) {
      if (currentGroup.length) groups.push(currentGroup);
      currentGroup = [span];
      currentY = y;
    } else {
      currentGroup.push(span);
    }
  }
  if (currentGroup.length) groups.push(currentGroup);
  return groups;
}

export function PageRenderer({ pdfDoc, pageNum, scale, highlightLineIndex, pageRef }) {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const lineGroupsRef = useRef([]);
  const prevHighlightRef = useRef(null);

  // Render the page whenever pdfDoc, pageNum, or scale changes.
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !textLayerRef.current) return;
    const cancel = renderPage(pdfDoc, pageNum, canvasRef.current, scale, textLayerRef.current);

    // After a short delay (text layer populated asynchronously), build line groups.
    const timer = setTimeout(() => {
      lineGroupsRef.current = buildLineGroups(textLayerRef.current);
    }, 300);

    return () => {
      cancel();
      clearTimeout(timer);
    };
  }, [pdfDoc, pageNum, scale]);

  // Apply/remove highlight class when highlightLineIndex changes.
  useEffect(() => {
    const groups = lineGroupsRef.current;

    // Remove previous highlight.
    if (prevHighlightRef.current !== null && groups[prevHighlightRef.current]) {
      for (const span of groups[prevHighlightRef.current]) {
        span.classList.remove(styles.highlighted);
      }
    }

    // Apply new highlight.
    if (highlightLineIndex !== null && highlightLineIndex !== undefined && groups[highlightLineIndex]) {
      for (const span of groups[highlightLineIndex]) {
        span.classList.add(styles.highlighted);
      }
      prevHighlightRef.current = highlightLineIndex;
    } else {
      prevHighlightRef.current = null;
    }
  }, [highlightLineIndex]);

  return (
    <div className={styles.page} ref={pageRef} data-page-num={pageNum}>
      <canvas ref={canvasRef} className={styles.canvas} />
      <div ref={textLayerRef} className={styles.textLayer} />
    </div>
  );
}
