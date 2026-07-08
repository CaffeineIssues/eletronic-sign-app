import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker?url";
import { LoadingBlock } from "./Spinner";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

function PdfPage({ page, scale, pageNumber, renderOverlay }) {
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [size, setSize] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function renderPage() {
      const canvas = canvasRef.current;
      if (!canvas || !page) return;

      setError(null);
      setSize(null);

      try {
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            // Ignore cancel errors
          }

          renderTaskRef.current = null;
        }

        const viewport = page.getViewport({ scale });
        const dpr = Math.max(window.devicePixelRatio || 1, 1);

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);

        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext("2d");

        if (!ctx) {
          throw new Error("Não foi possível criar o canvas do PDF.");
        }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const renderTask = page.render({
          canvasContext: ctx,
          viewport,
        });

        renderTaskRef.current = renderTask;

        await renderTask.promise;

        if (!cancelled) {
          setSize({
            width: viewport.width,
            height: viewport.height,
          });
        }
      } catch (err) {
        if (cancelled) return;

        if (err?.name === "RenderingCancelledException") {
          return;
        }

        console.error("PDF page render error:", err);
        setError(err?.message || "Falha ao renderizar esta página.");
      }
    }

    renderPage();

    return () => {
      cancelled = true;

      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // Ignore cancel errors
        }

        renderTaskRef.current = null;
      }
    };
  }, [page, scale]);

  return (
    <div>
      <div className="pdf-page-wrap">
        <canvas ref={canvasRef} />

        {size && renderOverlay && renderOverlay(pageNumber, size)}

        {error && (
          <div className="alert alert-error" style={{ marginTop: 10 }}>
            Não foi possível renderizar a página {pageNumber}: {error}
          </div>
        )}
      </div>

      <div className="pdf-page-num">Página {pageNumber}</div>
    </div>
  );
}

/**
 * Renders every page of the PDF at `fileUrl`.
 * `renderOverlay(pageNumber, { width, height })` lets callers draw
 * absolutely-positioned fields on top of each page.
 */
export default function PdfViewer({ fileUrl, renderOverlay, maxWidth = 820 }) {
  const [pages, setPages] = useState(null);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fileUrl) return undefined;

    let cancelled = false;
    let loadingTask = null;
    let loadedDoc = null;

    async function loadPdf() {
      setPages(null);
      setError(null);

      try {
        loadingTask = pdfjsLib.getDocument({
          url: fileUrl,

          // Safari-safe options
          disableFontFace: true,
          useSystemFonts: true,
          isEvalSupported: false,
          disableAutoFetch: false,
          disableStream: false,
        });

        loadedDoc = await loadingTask.promise;

        if (cancelled) return;

        const loadedPages = [];

        for (let i = 1; i <= loadedDoc.numPages; i += 1) {
          if (cancelled) return;

          const page = await loadedDoc.getPage(i);
          loadedPages.push(page);
        }

        if (cancelled) return;

        if (!loadedPages.length) {
          throw new Error("O PDF não possui páginas.");
        }

        const baseWidth = loadedPages[0].getViewport({ scale: 1 }).width;
        const isNarrow = window.innerWidth < 640;

        const targetWidth = Math.min(
          maxWidth,
          window.innerWidth - (isNarrow ? 40 : 60),
        );

        setScale(targetWidth / baseWidth);
        setPages(loadedPages);
      } catch (err) {
        if (cancelled) return;

        console.error("PDF load error:", err);

        setError(
          err?.message ||
            "Falha ao carregar o PDF. Tente abrir em outro navegador.",
        );
      }
    }

    loadPdf();

    return () => {
      cancelled = true;

      if (loadingTask) {
        try {
          loadingTask.destroy();
        } catch {
          // Ignore destroy errors
        }
      }

      if (loadedDoc) {
        try {
          loadedDoc.destroy();
        } catch {
          // Ignore destroy errors
        }
      }
    };
  }, [fileUrl, maxWidth]);

  if (error) {
    return (
      <div className="alert alert-error">
        Não foi possível exibir o PDF: {error}
      </div>
    );
  }

  if (!pages) {
    return <LoadingBlock label="Renderizando PDF…" />;
  }

  return (
    <div className="pdf-stage">
      {pages.map((page, index) => (
        <PdfPage
          key={index}
          page={page}
          scale={scale}
          pageNumber={index + 1}
          renderOverlay={renderOverlay}
        />
      ))}
    </div>
  );
}
