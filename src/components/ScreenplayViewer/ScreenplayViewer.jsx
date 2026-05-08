import { useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { PageRenderer } from './PageRenderer';
import styles from './ScreenplayViewer.module.css';

// Exposed via ref: scrollToLine(pageNum, lineIndex)
export const ScreenplayViewer = forwardRef(function ScreenplayViewer(
  { pdfDoc, numPages, currentPageNum, currentLineIndex, scale },
  ref
) {
  const containerRef = useRef(null);
  const pageRefsMap = useRef(new Map()); // pageNum -> HTMLElement

  const setPageRef = useCallback((pageNum, el) => {
    if (el) pageRefsMap.current.set(pageNum, el);
    else pageRefsMap.current.delete(pageNum);
  }, []);

  // Expose scroll control to parent (ScreenplayScreen RAF loop).
  useImperativeHandle(ref, () => ({
    getScrollTarget(pageNum) {
      const container = containerRef.current;
      const pageEl = pageRefsMap.current.get(pageNum);
      if (!container || !pageEl) return null;

      // Find the highlighted span within the page.
      const highlightedSpan = pageEl.querySelector('span.highlighted');
      const pageTop = pageEl.offsetTop;
      const spanOffset = highlightedSpan ? highlightedSpan.offsetTop : 0;
      const viewportMid = container.clientHeight / 2;

      return pageTop + spanOffset - viewportMid + 80;
    },
    get scrollTop() {
      return containerRef.current?.scrollTop ?? 0;
    },
    set scrollTop(val) {
      if (containerRef.current) containerRef.current.scrollTop = val;
    },
  }), []);

  const pages = Array.from({ length: numPages }, (_, i) => i + 1);

  return (
    <div ref={containerRef} className={styles.container}>
      <div className={styles.column}>
        {pages.map((pageNum) => (
          <PageRenderer
            key={pageNum}
            pdfDoc={pdfDoc}
            pageNum={pageNum}
            scale={scale}
            highlightLineIndex={pageNum === currentPageNum ? currentLineIndex : null}
            pageRef={(el) => setPageRef(pageNum, el)}
          />
        ))}
        {/* Bottom padding so the last page can scroll to center. */}
        <div className={styles.bottomPad} />
      </div>
    </div>
  );
});
