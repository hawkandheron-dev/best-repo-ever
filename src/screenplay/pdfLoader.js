import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function loadPdf(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdfDoc = await loadingTask.promise;
  return pdfDoc;
}

// Extract text layout data from every page. Returns pageData array.
export async function extractAllPageData(pdfDoc) {
  const pageData = [];
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items = textContent.items;

    let lineCount = 0;
    let charCount = 0;
    let lastY = null;
    const lineYCoords = [];

    // PDF y-axis: higher value = higher on the page (bottom-left origin).
    for (const item of items) {
      if (!item.str) continue;
      const y = item.transform[5];
      if (lastY === null || Math.abs(y - lastY) > 6) {
        lineCount++;
        lastY = y;
        lineYCoords.push(y);
      }
      charCount += item.str.length;
    }

    // Descending = top-to-bottom reading order (high y = top of page in PDF coords).
    lineYCoords.sort((a, b) => b - a);

    const densityScore = Math.max(0.4, Math.min(2.0, lineCount / 55));
    pageData.push({ pageNum, lineCount, charCount, densityScore, lineYCoords });
  }
  return pageData;
}

// Render a single PDF page to a canvas element, and populate a text layer div.
// Returns a cleanup function that cancels any in-progress render.
export function renderPage(pdfDoc, pageNum, canvasEl, scale, textLayerEl) {
  let cancelled = false;
  let renderTask = null;

  (async () => {
    try {
      const page = await pdfDoc.getPage(pageNum);
      if (cancelled) return;

      const viewport = page.getViewport({ scale });
      canvasEl.width = viewport.width;
      canvasEl.height = viewport.height;

      const ctx = canvasEl.getContext('2d');
      renderTask = page.render({ canvasContext: ctx, viewport });

      try {
        await renderTask.promise;
      } catch (err) {
        if (err?.name === 'RenderingCancelledException') return;
        throw err;
      }

      if (cancelled) return;

      // Build text layer.
      textLayerEl.innerHTML = '';
      textLayerEl.style.width = `${viewport.width}px`;
      textLayerEl.style.height = `${viewport.height}px`;

      const textContent = await page.getTextContent();
      if (cancelled) return;

      const textLayerInstance = new TextLayer({
        textContentSource: textContent,
        container: textLayerEl,
        viewport,
      });
      await textLayerInstance.render();
    } catch (err) {
      if (!cancelled) console.error('PDF render error:', err);
    }
  })();

  return () => {
    cancelled = true;
    renderTask?.cancel();
  };
}
