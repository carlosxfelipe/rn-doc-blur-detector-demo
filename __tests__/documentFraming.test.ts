jest.mock('rn-doc-blur-detector', () =>
  require('../node_modules/rn-doc-blur-detector/lib/commonjs/index.js'),
);

import { analyzeDocumentFraming } from '../src/utils/documentFraming';

function createBuffer(
  width: number,
  height: number,
  bgRgb: [number, number, number],
) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = bgRgb[0];
    data[i + 1] = bgRgb[1];
    data[i + 2] = bgRgb[2];
    data[i + 3] = 255;
  }
  return { width, height, data };
}

function drawRectWithTextLines(
  buf: { width: number; height: number; data: Uint8ClampedArray },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  docRgb: [number, number, number],
) {
  const { width, height, data } = buf;
  const cx0 = Math.max(0, Math.round(x0));
  const cy0 = Math.max(0, Math.round(y0));
  const cx1 = Math.min(width - 1, Math.round(x1));
  const cy1 = Math.min(height - 1, Math.round(y1));

  for (let y = cy0; y <= cy1; y++) {
    for (let x = cx0; x <= cx1; x++) {
      const idx = (y * width + x) * 4;
      const inInnerTextBand =
        x > cx0 + 8 &&
        x < cx1 - 8 &&
        y > cy0 + 8 &&
        y < cy1 - 8 &&
        y % 12 < 3 &&
        x % 5 < 3;
      const c = inInnerTextBand ? 30 : 255;
      data[idx] = inInnerTextBand ? c : docRgb[0];
      data[idx + 1] = inInnerTextBand ? c : docRgb[1];
      data[idx + 2] = inInnerTextBand ? c : docRgb[2];
      data[idx + 3] = 255;
    }
  }
}

describe('analyzeDocumentFraming', () => {
  test('returns insufficient for blank solid buffer', () => {
    const blank = createBuffer(200, 200, [245, 245, 245]);
    const res = analyzeDocumentFraming(blank, 'auto');
    expect(res.status).toBe('insufficient');
    expect(res.score).toBe(0);
  });

  test('evaluates a well-framed A4 document on a dark desk as good', () => {
    // 240x300 frame, A4 portrait doc (~150x212 => ratio ~1.41, ~59% area)
    const img = createBuffer(240, 300, [35, 30, 25]);
    drawRectWithTextLines(img, 45, 44, 195, 256, [246, 246, 246]);

    const res = analyzeDocumentFraming(img, 'a4');
    expect(res.status).toBe('good');
    expect(res.metrics.clippedEdges).toEqual([]);
    expect(res.metrics.areaCoverage).toBeGreaterThan(0.35);
    expect(res.metrics.aspectRatio).toBeGreaterThan(1.25);
    expect(res.metrics.aspectRatio).toBeLessThan(1.65);
    expect(res.score).toBeGreaterThanOrEqual(80);
  });

  test('evaluates a well-framed ID card (RG/CNH) as good', () => {
    // 240x180 frame, landscape ID card ~160x102 (ratio ~1.57)
    const img = createBuffer(240, 180, [40, 45, 50]);
    drawRectWithTextLines(img, 40, 39, 200, 141, [215, 238, 224]);

    const res = analyzeDocumentFraming(img, 'id-card');
    expect(res.status).toBe('good');
    expect(res.metrics.clippedEdges).toEqual([]);
    expect(res.metrics.aspectRatio).toBeGreaterThan(1.3);
    expect(res.metrics.aspectRatio).toBeLessThan(1.85);
  });

  test('detects clipped document touching frame edges as poor', () => {
    // Document cut off on right and bottom edges
    const img = createBuffer(240, 240, [30, 30, 30]);
    drawRectWithTextLines(img, 60, 50, 239, 239, [245, 245, 245]);

    const res = analyzeDocumentFraming(img, 'a4');
    expect(res.status).toBe('poor');
    expect(res.metrics.clippedEdges).toContain('right');
    expect(res.metrics.clippedEdges).toContain('bottom');
    expect(res.score).toBeLessThan(65);
  });

  test('detects distant/too-small document as poor', () => {
    // Tiny A4 document occupying < 12% of the frame
    const img = createBuffer(240, 240, [30, 35, 40]);
    drawRectWithTextLines(img, 95, 80, 145, 150, [245, 245, 245]);

    const res = analyzeDocumentFraming(img, 'a4');
    expect(res.status).toBe('poor');
    expect(res.metrics.areaCoverage).toBeLessThan(0.2);
  });

  test('recognizes clean full-page scan / PDF with preserved margins', () => {
    const img = createBuffer(210, 297, [250, 250, 250]);
    // Print inner text lines with clean 18px margins on all sides
    drawRectWithTextLines(img, 18, 18, 192, 279, [250, 250, 250]);

    const res = analyzeDocumentFraming(img, 'a4');
    expect(res.status).toBe('good');
    expect(res.metrics.isFullPageScan).toBe(true);
    expect(res.metrics.clippedEdges).toEqual([]);
  });

  test('handles handheld ID card over heterogeneous background (skin top, dark desk bottom, tight side margins)', () => {
    // Portrait frame similar to 721x1280 scaled
    const img = createBuffer(180, 320, [38, 35, 34]);
    // Smooth skin/fingers in top 15%
    for (let y = 0; y < 52; y++) {
      for (let x = 0; x < 180; x++) {
        const idx = (y * 180 + x) * 4;
        img.data[idx] = 205;
        img.data[idx + 1] = 152;
        img.data[idx + 2] = 140;
      }
    }
    // ID card in middle with tight ~4px (~2.2%) left/right margins and clear top/bottom margins
    drawRectWithTextLines(img, 4, 46, 175, 278, [216, 224, 206]);

    const res = analyzeDocumentFraming(img, 'id-card');
    expect(res.status).toBe('good');
    expect(res.metrics.clippedEdges).toEqual([]);
    expect(res.metrics.boundingBox).not.toBeNull();
    expect(res.metrics.boundingBox!.y).toBeGreaterThan(0.08);
    expect(res.metrics.boundingBox!.y + res.metrics.boundingBox!.height).toBeLessThan(0.95);
    expect(res.metrics.aspectRatio).toBeGreaterThan(1.25);
    expect(res.metrics.aspectRatio).toBeLessThan(1.65);
  });

  test('captures full ID card width even with dense right header and wide blank gutter', () => {
    const img = createBuffer(180, 320, [36, 32, 30]);
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 180; x++) {
        const idx = (y * 180 + x) * 4;
        img.data[idx] = 205;
        img.data[idx + 1] = 152;
        img.data[idx + 2] = 140;
      }
    }
    // Draw uniform card body first
    for (let y = 46; y <= 278; y++) {
      for (let x = 5; x <= 174; x++) {
        const idx = (y * 180 + x) * 4;
        img.data[idx] = 216;
        img.data[idx + 1] = 222;
        img.data[idx + 2] = 204;
      }
    }
    // Dense header on right strip (132..168), blank gutter (108..131), lighter left fields (14..107)
    drawRectWithTextLines(img, 132, 54, 168, 270, [216, 222, 204]);
    drawRectWithTextLines(img, 18, 80, 92, 230, [216, 222, 204]);

    const res = analyzeDocumentFraming(img, 'id-card');
    expect(res.status).toBe('good');
    expect(res.metrics.boundingBox).not.toBeNull();
    expect(res.metrics.boundingBox!.width).toBeGreaterThan(0.85);
    expect(res.metrics.areaCoverage).toBeGreaterThan(0.6);
    expect(res.metrics.aspectRatio).toBeGreaterThan(1.25);
    expect(res.metrics.aspectRatio).toBeLessThan(1.7);
  });
});
