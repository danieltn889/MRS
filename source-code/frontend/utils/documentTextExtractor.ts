import JSZip from 'jszip';
import Tesseract from 'tesseract.js';

export type ExtractionMethod = 'text'| 'ocr'| 'mixed';

export interface ExtractedDocumentText {
  text: string;
  method: ExtractionMethod;
  pageCount?: number;
}

const normalizeWhitespace = (value: string): string =>
  value
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// Watermark patterns added by free scanner apps (CamScanner, Adobe Scan free tier, etc.)
const WATERMARK_PATTERNS: RegExp[] = [
  /\b(?:downloaded\s+from\s+)?CamScanner\b/gi,
  /\bScanned\s+(?:with|by|using)\s+CamScanner\b/gi,
  /\bSign\s+up\s+to\s+see\s+full\s+version\b/gi,
  /\bwww\.camscanner\.com\b/gi,
];

const stripWatermarks = (text: string): string => {
  let result = text;
  for (const pattern of WATERMARK_PATTERNS) {
    result = result.replace(pattern, '');
  }
  // Collapse blank lines left behind after removal
  return result.replace(/\n{3,}/g, '\n\n').trim();
};

const MIN_READABLE_PAGE_TEXT_LENGTH = 10;
const OCR_RENDER_SCALE = 3;
const OCR_MAX_PIXELS = 14_000_000;
const OCR_PAGE_SEGMENTATION_MODES = ['6', '11'];

const getCanvasScale = (width: number, height: number, preferredScale = OCR_RENDER_SCALE): number => {
  const pixelsAtPreferredScale = width * height * preferredScale * preferredScale;

  if (pixelsAtPreferredScale <= OCR_MAX_PIXELS) {
    return preferredScale;
  }

  return Math.max(1.5, Math.sqrt(OCR_MAX_PIXELS / (width * height)));
};

type OcrPreprocessMode = 'grayscale'| 'threshold';

const preprocessCanvasForOcr = (
  sourceCanvas: HTMLCanvasElement,
  mode: OcrPreprocessMode
): HTMLCanvasElement => {
  const processedCanvas = document.createElement('canvas');
  const processedContext = processedCanvas.getContext('2d', { alpha: false });

  if (!processedContext) {
    return sourceCanvas;
  }

  processedCanvas.width = sourceCanvas.width;
  processedCanvas.height = sourceCanvas.height;
  processedContext.drawImage(sourceCanvas, 0, 0);

  const imageData = processedContext.getImageData(0, 0, processedCanvas.width, processedCanvas.height);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const gray = (data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114);
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
    const value = mode === 'threshold'? (contrasted > 172 ? 255 : 0) : contrasted;

    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }

  processedContext.putImageData(imageData, 0, 0);
  return processedCanvas;
};

const scoreOcrText = (text: string): number => {
  const normalized = normalizeWhitespace(text);

  if (!normalized) {
    return 0;
  }

  const letters = normalized.match(/[A-Za-z]/g)?.length ?? 0;
  const digits = normalized.match(/\d/g)?.length ?? 0;
  const wordLikeTokens = normalized.match(/\b[A-Za-z]{3,}\b/g)?.length ?? 0;
  const noisyRuns = normalized.match(/([_=|~\-]{3,}|(?:\bTT+\b)|(?:\bEE+\b)|(?:\boo+\b))/g)?.length ?? 0;
  const punctuation = normalized.match(/[^\w\s]/g)?.length ?? 0;
  const total = normalized.length;
  const usefulRatio = (letters + digits) / Math.max(total, 1);
  const punctuationRatio = punctuation / Math.max(total, 1);

  return (wordLikeTokens * 3) + letters + (digits * 0.5) + (usefulRatio * 80) - (noisyRuns * 20) - (punctuationRatio * 80);
};

const cleanupOcrText = (text: string): string => {
  const lines = normalizeWhitespace(text).split('\n');

  return normalizeWhitespace(
    lines
      .map((line) => line.replace(/[|_~=]{2,}/g, '').replace(/\b(?:TT+|EE+|oo+)\b/g, '').trim())
      .filter((line) => {
        if (!line) {
          return false;
        }

        const alphanumericCount = line.replace(/[^A-Za-z0-9]/g, '').length;
        const noiseCount = line.replace(/[A-Za-z0-9\s]/g, '').length;

        // Lenient filter: keep any line with at least 1 alphanumeric char and not pure noise.
        // This prevents over-filtering compressed or low-quality scans.
        return alphanumericCount >= 1 && noiseCount <= Math.max(12, alphanumericCount * 2);
      })
      .join('\n')
  );
};

const canvasToPngBlob = async (canvas: HTMLCanvasElement): Promise<Blob> => {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });

  if (!blob) {
    throw new Error('Could not prepare image for OCR.');
  }

  return blob;
};

const recognizeCanvasText = async (canvas: HTMLCanvasElement): Promise<string> => {
  const candidates: string[] = [];
  const canvases: HTMLCanvasElement[] = [
    canvas,
    preprocessCanvasForOcr(canvas, 'grayscale'),
    preprocessCanvasForOcr(canvas, 'threshold'),
  ];

  try {
    for (const ocrCanvas of canvases) {
      const ocrBlob = await canvasToPngBlob(ocrCanvas);

      for (const pageSegmentationMode of OCR_PAGE_SEGMENTATION_MODES) {
        const result = await Tesseract.recognize(ocrBlob, 'eng', {
          preserve_interword_spaces: '1',
          tessedit_pageseg_mode: pageSegmentationMode,
        } as any);

        candidates.push(result.data.text || '');
      }
    }

    const bestText = candidates
      .map((text) => cleanupOcrText(text))
      .sort((a, b) => scoreOcrText(b) - scoreOcrText(a))[0] || '';

    return normalizeWhitespace(bestText);
  } finally {
    for (const ocrCanvas of canvases) {
      if (ocrCanvas !== canvas) {
        ocrCanvas.width = 0;
        ocrCanvas.height = 0;
      }
    }
  }
};

export const isSupportedTextFile = (file: File): boolean =>
  file.type === 'application/pdf'
  || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  || file.type === 'application/msword'
  || file.type.startsWith('image/');

export const extractPdfText = async (file: Blob): Promise<ExtractedDocumentText> => {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  const pagesNeedingOcr: number[] = [];

  const extractPdfPageWithOcr = async (pageNumber: number): Promise<string> => {
    if (typeof document === 'undefined') {
      return '';
    }

    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: getCanvasScale(baseViewport.width, baseViewport.height),
    });
    const canvas = document.createElement('canvas');
    const canvasContext = canvas.getContext('2d', { alpha: false });

    if (!canvasContext) {
      return '';
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvasContext.fillStyle = '#ffffff';
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);

    try {
      await page.render({ canvas, canvasContext, viewport }).promise;
      return recognizeCanvasText(canvas);
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  };

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = normalizeWhitespace(content.items.map((item: any) => item.str || '').join(''));
    pages.push(pageText);

    if (pageText.length < MIN_READABLE_PAGE_TEXT_LENGTH) {
      pagesNeedingOcr.push(pageNumber);
    }
  }

  let usedOcr = false;

  if (pagesNeedingOcr.length > 0) {
    for (const pageNumber of pagesNeedingOcr) {
      const ocrText = await extractPdfPageWithOcr(pageNumber);

      if (ocrText) {
        pages[pageNumber - 1] = ocrText;
        usedOcr = true;
      }
    }
  }

  // Keep any partial pdfjs text for pages where OCR also returned nothing
  // so we never lose text that pdfjs managed to get, even if short.
  const combinedPages = pages.map((pageText, index) => {
    const pageNumber = index + 1;
    const needsOcr = pagesNeedingOcr.includes(pageNumber);
    return needsOcr && !pageText ? '': pageText;
  });

  const text = stripWatermarks(normalizeWhitespace(combinedPages.filter(Boolean).join('\n\n')));

  const hasEmbeddedText = pages.some((pageText, index) => {
    const pageNumber = index + 1;
    return !pagesNeedingOcr.includes(pageNumber) && pageText.length >= MIN_READABLE_PAGE_TEXT_LENGTH;
  });
  const method: ExtractionMethod = usedOcr ? (hasEmbeddedText ? 'mixed': 'ocr') : 'text';

  // Return empty text with a flag instead of throwing   let callers decide how to handle it.
  return { text, method, pageCount: pdf.numPages };
};

export const extractDocxText = async (file: Blob): Promise<ExtractedDocumentText> => {
  const zip = await JSZip.loadAsync(file);
  const xml = await zip.file('word/document.xml')?.async('string');

  if (!xml) {
    throw new Error('Could not find readable Word document content.');
  }

  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const paragraphs = Array.from(doc.getElementsByTagNameNS('*', 'p'));
  const text = stripWatermarks(normalizeWhitespace(
    paragraphs
      .map((p) => Array.from(p.getElementsByTagNameNS('*', 't')).map((t) => t.textContent ?? '').join(''))
      .filter(Boolean)
      .join('\n')
  ));

  if (!text) {
    throw new Error('No readable text found in this Word document.');
  }

  return { text, method: 'text'};
};

export const extractImageText = async (file: Blob): Promise<ExtractedDocumentText> => {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = new window.Image();
    image.src = imageUrl;
    await image.decode();

    const scale = getCanvasScale(image.naturalWidth || image.width, image.naturalHeight || image.height, 2);
    const canvas = document.createElement('canvas');
    const canvasContext = canvas.getContext('2d', { alpha: false });

    if (!canvasContext) {
      throw new Error('Could not prepare this image for OCR.');
    }

    canvas.width = Math.ceil((image.naturalWidth || image.width) * scale);
    canvas.height = Math.ceil((image.naturalHeight || image.height) * scale);
    canvasContext.fillStyle = '#ffffff';
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);
    canvasContext.drawImage(image, 0, 0, canvas.width, canvas.height);

    const text = stripWatermarks(await recognizeCanvasText(canvas));
    canvas.width = 0;
    canvas.height = 0;

    return { text, method: 'ocr', pageCount: 1 };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
};

export const extractTextFromFile = async (file: File | Blob, fileName = ''): Promise<ExtractedDocumentText> => {
  const mimeType = file instanceof File ? file.type : '';
  const lowerName = fileName.toLowerCase();

  if (mimeType === 'application/pdf'|| lowerName.endsWith('.pdf')) {
    return extractPdfText(file);
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || lowerName.endsWith('.docx')
  ) {
    return extractDocxText(file);
  }

  if (mimeType.startsWith('image/')) {
    return extractImageText(file);
  }

  throw new Error('Unsupported file type for text extraction.');
};
