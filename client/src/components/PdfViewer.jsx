import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { LoadingBlock } from './Spinner';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

function PdfPage({ page, scale, pageNumber, renderOverlay }) {
  const canvasRef = useRef(null);
  const [size, setSize] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const viewport = page.getViewport({ scale });
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const ctx = canvas.getContext('2d');
    const task = page.render({
      canvasContext: ctx,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
    });
    task.promise
      .then(() => {
        if (!cancelled) setSize({ width: viewport.width, height: viewport.height });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [page, scale]);

  return (
    <div>
      <div className="pdf-page-wrap">
        <canvas ref={canvasRef} />
        {size && renderOverlay && renderOverlay(pageNumber, size)}
      </div>
      <div className="pdf-page-num">Page {pageNumber}</div>
    </div>
  );
}

/**
 * Renders every page of the PDF at `fileUrl`. `renderOverlay(pageNumber, {width, height})`
 * lets callers draw absolutely-positioned elements (fields) on top of each page.
 */
export default function PdfViewer({ fileUrl, renderOverlay, maxWidth = 820 }) {
  const [pages, setPages] = useState(null);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fileUrl) return;
    let cancelled = false;
    let pdfDoc = null;
    setPages(null);
    setError(null);

    pdfjsLib
      .getDocument(fileUrl)
      .promise.then(async (doc) => {
        pdfDoc = doc;
        const loaded = [];
        for (let i = 1; i <= doc.numPages; i++) {
          loaded.push(await doc.getPage(i));
        }
        if (cancelled) return;
        const baseWidth = loaded[0].getViewport({ scale: 1 }).width;
        const targetWidth = Math.min(maxWidth, window.innerWidth - 60);
        setScale(targetWidth / baseWidth);
        setPages(loaded);
      })
      .catch((err) => !cancelled && setError(err.message || 'Failed to load PDF'));

    return () => {
      cancelled = true;
      if (pdfDoc) pdfDoc.destroy().catch(() => {});
    };
  }, [fileUrl, maxWidth]);

  if (error) return <div className="alert alert-error">Could not display the PDF: {error}</div>;
  if (!pages) return <LoadingBlock label="Rendering PDF…" />;

  return (
    <div className="pdf-stage">
      {pages.map((page, idx) => (
        <PdfPage key={idx} page={page} scale={scale} pageNumber={idx + 1} renderOverlay={renderOverlay} />
      ))}
    </div>
  );
}
