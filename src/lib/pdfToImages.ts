/**
 * Converts PDF pages to optimized base64 JPEG images.
 * Keeps resolution sharp for OCR while drastically reducing token & file size
 * to stay well within API rate limits (e.g. Groq 8000 TPM limit).
 */

let pdfjsLoaded: typeof import('pdfjs-dist') | null = null;

async function loadPdfjs() {
  if (pdfjsLoaded) return pdfjsLoaded;
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  pdfjsLoaded = pdfjs;
  return pdfjs;
}

export async function getPageCount(file: File): Promise<number> {
  const pdfjs = await loadPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  return pdf.numPages;
}

export async function pdfToImages(file: File): Promise<string[]> {
  const pdfjs = await loadPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const images: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const unscaledViewport = page.getViewport({ scale: 1.0 });

    // Target a balanced max dimension of ~1000px (ideal for clear vision OCR without excessive tokens)
    const maxDim = Math.max(unscaledViewport.width, unscaledViewport.height);
    const scale = maxDim > 0 ? Math.min(1.4, 1000 / maxDim) : 1.2;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;

    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;

    // Use JPEG 0.8 quality for massive token/payload reduction
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    images.push(dataUrl);

    canvas.remove();
  }

  return images;
}

export async function imageFileToBase64(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Failed to read image'));
        return;
      }

      // Resize image on canvas to optimize token consumption
      const img = new Image();
      img.onload = () => {
        const maxDim = 1000;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);

        const optimizedUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve([optimizedUrl]);
      };
      img.onerror = () => resolve([reader.result as string]);
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function fileToImages(file: File): Promise<string[]> {
  if (file.type === 'application/pdf') {
    return pdfToImages(file);
  }
  return imageFileToBase64(file);
}
