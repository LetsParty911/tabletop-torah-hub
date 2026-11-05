// Browser-only: render page 1 of a PDF File to a PNG data-URL (~800px long edge).
// Used by the admin upload/replace flows so every row gets a first-page preview.
export async function renderFirstPageThumbBase64(file: File): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const pdfjs: any = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = 800 / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const dataUrl = canvas.toDataURL("image/png");
    const comma = dataUrl.indexOf(",");
    return comma > -1 ? dataUrl.slice(comma + 1) : null;
  } catch (e) {
    console.error("thumbnail render failed", e);
    return null;
  }
}

// Derived from the already-rendered first page, without rendering the PDF twice.
export async function renderSmallThumbBase64(pngBase64: string): Promise<string | null> {
  try {
    const image = new Image();
    image.src = `data:image/png;base64,${pngBase64}`;
    await image.decode();
    const scale = Math.min(1, 160 / image.width, 210 / image.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL("image/webp", 0.86);
    const encoded = result.startsWith("data:image/webp;base64,") ? result.split(",")[1] ?? null : null;
    return encoded && encoded.length * 0.75 <= 24576 ? encoded : null;
  } catch {
    return null;
  }
}
