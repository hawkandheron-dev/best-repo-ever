import { useRef, useState, useCallback } from 'react';
import { useScreenplay } from '../../screenplay/screenwplayContext';
import { loadPdf, extractAllPageData } from '../../screenplay/pdfLoader';
import { LOAD_PDF, LOAD_ERROR } from '../../screenplay/screenwplayActions';
import styles from './ScreenplayLoader.module.css';

export function ScreenplayLoader() {
  const { dispatch } = useScreenplay();
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const processFile = useCallback(async (file) => {
    if (!file || file.type !== 'application/pdf') {
      dispatch({ type: LOAD_ERROR, error: 'Please select a PDF file.' });
      return;
    }
    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const pdfDoc = await loadPdf(buffer);
      const pageData = await extractAllPageData(pdfDoc);
      dispatch({ type: LOAD_PDF, pdfDoc, numPages: pdfDoc.numPages, pageData });
    } catch (err) {
      dispatch({ type: LOAD_ERROR, error: err.message || 'Failed to load PDF.' });
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  return (
    <div
      className={`${styles.zone} ${dragging ? styles.dragging : ''}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      {loading ? (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Parsing screenplay…</p>
        </div>
      ) : (
        <>
          <div className={styles.icon}>🎬</div>
          <p className={styles.primary}>Drop a screenplay PDF here</p>
          <p className={styles.secondary}>or</p>
          <button className={styles.browse} onClick={() => inputRef.current?.click()}>
            Browse for PDF
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className={styles.hidden}
            onChange={onFileChange}
          />
        </>
      )}
    </div>
  );
}
