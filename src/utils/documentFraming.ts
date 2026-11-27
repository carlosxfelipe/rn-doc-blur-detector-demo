import {
  type BlurLocale,
  resizeRgbaIfNeeded,
  toGrayscaleLuminance,
} from 'rn-doc-blur-detector';

export type DocumentFramingProfile = 'off' | 'auto' | 'a4' | 'id-card';

export type ActiveFramingProfile = Exclude<DocumentFramingProfile, 'off'>;

export type FramingStatus = 'good' | 'warning' | 'poor' | 'insufficient';

export type FramingEdge = 'top' | 'right' | 'bottom' | 'left';

export interface DocumentFramingConfig {
  profile: DocumentFramingProfile;
  locale: BlurLocale;
  maxAnalysisDim: number;
  minAreaCoverage: number;
  minEdgeMarginRatio: number;
  maxCenterOffsetRatio: number;
  maxSkewDegrees: number;
  minAspectRatio: number;
  maxAspectRatio: number;
}

export interface NormalizedBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DocumentFramingMetrics {
  boundingBox: NormalizedBoundingBox | null;
  areaCoverage: number;
  margins: Record<FramingEdge, number>;
  clippedEdges: FramingEdge[];
  centerOffset: number;
  aspectRatio: number;
  skewDegrees: number;
  isFullPageScan: boolean;
  elapsedMs: number;
}

export interface DocumentFramingResult {
  status: FramingStatus;
  profile: ActiveFramingProfile;
  label: string;
  reason: string;
  score: number;
  issues: string[];
  metrics: DocumentFramingMetrics;
}

export interface RgbaImageLike {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

interface EdgeStats {
  meanLum: number;
  stdLum: number;
  strongEdgeRatio: number;
}

interface SpanRange {
  start: number;
  end: number;
  totalEnergy: number;
}

interface BoxGeometry {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
  skewDegrees: number;
  principalAspect: number;
}

const PROFILE_DEFAULTS: Record<
  ActiveFramingProfile,
  Omit<DocumentFramingConfig, 'profile' | 'locale' | 'maxAnalysisDim'>
> = {
  auto: {
    minAreaCoverage: 0.25,
    minEdgeMarginRatio: 0.012,
    maxCenterOffsetRatio: 0.22,
    maxSkewDegrees: 15,
    minAspectRatio: 1.12,
    maxAspectRatio: 2.05,
  },
  a4: {
    minAreaCoverage: 0.35,
    minEdgeMarginRatio: 0.012,
    maxCenterOffsetRatio: 0.2,
    maxSkewDegrees: 14,
    minAspectRatio: 1.18,
    maxAspectRatio: 1.72,
  },
  'id-card': {
    minAreaCoverage: 0.2,
    minEdgeMarginRatio: 0.012,
    maxCenterOffsetRatio: 0.22,
    maxSkewDegrees: 15,
    minAspectRatio: 1.25,
    maxAspectRatio: 1.88,
  },
};

const EDGE_LABELS: Record<BlurLocale, Record<FramingEdge, string>> = {
  'pt-BR': {
    top: 'superior',
    right: 'direita',
    bottom: 'inferior',
    left: 'esquerda',
  },
  en: {
    top: 'top',
    right: 'right',
    bottom: 'bottom',
    left: 'left',
  },
};

const PROFILE_LABELS: Record<
  BlurLocale,
  Record<ActiveFramingProfile, string>
> = {
  'pt-BR': {
    auto: 'documento',
    a4: 'folha A4 / contrato',
    'id-card': 'identidade (RG/CNH)',
  },
  en: {
    auto: 'document',
    a4: 'A4 sheet / contract',
    'id-card': 'ID card',
  },
};

function nowMs(): number {
  const perf = (globalThis as { performance?: { now: () => number } })
    .performance;
  return perf ? perf.now() : Date.now();
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundTo(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function resolveFramingConfig(
  input?: DocumentFramingProfile | Partial<DocumentFramingConfig>,
  locale: BlurLocale = 'pt-BR',
): DocumentFramingConfig {
  const profile: DocumentFramingProfile =
    typeof input === 'string' ? input : input?.profile ?? 'auto';
  const activeProfile: ActiveFramingProfile =
    profile === 'off' ? 'auto' : profile;
  const defaults = PROFILE_DEFAULTS[activeProfile];
  const overrides = typeof input === 'object' && input !== null ? input : {};

  return {
    profile,
    locale: overrides.locale ?? locale,
    maxAnalysisDim: overrides.maxAnalysisDim ?? 240,
    minAreaCoverage: overrides.minAreaCoverage ?? defaults.minAreaCoverage,
    minEdgeMarginRatio:
      overrides.minEdgeMarginRatio ?? defaults.minEdgeMarginRatio,
    maxCenterOffsetRatio:
      overrides.maxCenterOffsetRatio ?? defaults.maxCenterOffsetRatio,
    maxSkewDegrees: overrides.maxSkewDegrees ?? defaults.maxSkewDegrees,
    minAspectRatio: overrides.minAspectRatio ?? defaults.minAspectRatio,
    maxAspectRatio: overrides.maxAspectRatio ?? defaults.maxAspectRatio,
  };
}

function computeSobelGradient(
  lum: Float32Array,
  width: number,
  height: number,
): Uint8Array {
  const grad = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    const rowUp = (y - 1) * width;
    const row = y * width;
    const rowDn = (y + 1) * width;
    for (let x = 1; x < width - 1; x++) {
      const gx =
        -lum[rowUp + x - 1] +
        lum[rowUp + x + 1] -
        2 * lum[row + x - 1] +
        2 * lum[row + x + 1] -
        lum[rowDn + x - 1] +
        lum[rowDn + x + 1];
      const gy =
        -lum[rowUp + x - 1] -
        2 * lum[rowUp + x] -
        lum[rowUp + x + 1] +
        lum[rowDn + x - 1] +
        2 * lum[rowDn + x] +
        lum[rowDn + x + 1];
      grad[row + x] = Math.min(
        255,
        Math.round((Math.abs(gx) + Math.abs(gy)) * 0.25),
      );
    }
  }
  return grad;
}

function computeEdgeStats(
  lum: Float32Array,
  grad: Uint8Array,
  width: number,
  height: number,
): Record<FramingEdge, EdgeStats> {
  const strip = Math.max(2, Math.round(Math.min(width, height) * 0.025));

  const measureRegion = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): EdgeStats => {
    let sum = 0;
    let sqSum = 0;
    let strongEdges = 0;
    let count = 0;

    for (let y = y0; y < y1; y++) {
      const row = y * width;
      for (let x = x0; x < x1; x++) {
        const idx = row + x;
        const l = lum[idx];
        sum += l;
        sqSum += l * l;
        if (grad[idx] >= 28) strongEdges++;
        count++;
      }
    }

    if (count === 0) {
      return { meanLum: 0, stdLum: 0, strongEdgeRatio: 0 };
    }
    const mean = sum / count;
    const variance = Math.max(0, sqSum / count - mean * mean);
    return {
      meanLum: mean,
      stdLum: Math.sqrt(variance),
      strongEdgeRatio: strongEdges / count,
    };
  };

  return {
    top: measureRegion(0, 0, width, strip),
    bottom: measureRegion(0, height - strip, width, height),
    left: measureRegion(0, 0, strip, height),
    right: measureRegion(width - strip, 0, width, height),
  };
}

function smooth1D(values: Float32Array, radius: number): Float32Array {
  const n = values.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    const lo = Math.max(0, i - radius);
    const hi = Math.min(n - 1, i + radius);
    for (let j = lo; j <= hi; j++) {
      sum += values[j];
      count++;
    }
    out[i] = count > 0 ? sum / count : 0;
  }
  return out;
}

function findDominantSpan(
  profile: Float32Array,
  maxGap: number,
  minThresh = 3.0,
  peakFactor = 0.16,
): SpanRange | null {
  const n = profile.length;
  if (n === 0) return null;

  let peak = 0;
  for (let i = 0; i < n; i++) {
    if (profile[i] > peak) peak = profile[i];
  }
  if (peak < 2) return null;

  // Avoid percentile floors because a wide document (>90% of axis) puts p10/p25 inside the document itself.
  const thresh = Math.max(minThresh, peak * peakFactor);

  let best: SpanRange | null = null;
  let i = 0;

  while (i < n) {
    if (profile[i] < thresh) {
      i++;
      continue;
    }

    const start = i;
    let end = i;
    let energy = profile[i];
    let gap = 0;
    i++;

    while (i < n) {
      if (profile[i] >= thresh) {
        end = i;
        energy += profile[i];
        gap = 0;
      } else {
        gap++;
        if (gap > maxGap) break;
      }
      i++;
    }

    if (!best || energy > best.totalEnergy) {
      best = { start, end, totalEnergy: energy };
    }
  }

  return best;
}

function matchesSurfaceRgb(
  rgba: Uint8Array | Uint8ClampedArray,
  pixelOffset: number,
  surface: { r: number; g: number; b: number },
  avgTol = 28,
  maxChannelTol = 38,
): boolean {
  const dr = Math.abs(rgba[pixelOffset] - surface.r);
  const dg = Math.abs(rgba[pixelOffset + 1] - surface.g);
  const db = Math.abs(rgba[pixelOffset + 2] - surface.b);
  return (dr + dg + db) / 3 <= avgTol && Math.max(dr, dg, db) <= maxChannelTol;
}

function medianOfSorted(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function estimateSurfaceColor(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): { r: number; g: number; b: number } {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const ix0 = Math.max(0, Math.round(x0 + (x1 - x0) * 0.2));
  const ix1 = Math.min(width - 1, Math.round(x1 - (x1 - x0) * 0.2));
  const iy0 = Math.max(0, Math.round(y0 + (y1 - y0) * 0.2));
  const iy1 = Math.round(y1 - (y1 - y0) * 0.2);

  const stepY = Math.max(1, Math.floor((iy1 - iy0) / 16));
  const stepX = Math.max(1, Math.floor((ix1 - ix0) / 16));

  for (let y = iy0; y <= iy1; y += stepY) {
    for (let x = ix0; x <= ix1; x += stepX) {
      const p = (y * width + x) * 4;
      rs.push(rgba[p]);
      gs.push(rgba[p + 1]);
      bs.push(rgba[p + 2]);
    }
  }

  return {
    r: medianOfSorted(rs),
    g: medianOfSorted(gs),
    b: medianOfSorted(bs),
  };
}

function expandToDocumentMargins(
  rgba: Uint8Array | Uint8ClampedArray,
  grad: Uint8Array,
  width: number,
  height: number,
  spanX: SpanRange,
  spanY: SpanRange,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = spanX.start;
  let maxX = spanX.end;
  let minY = spanY.start;
  let maxY = spanY.end;

  const surface = estimateSurfaceColor(rgba, width, minX, minY, maxX, maxY);
  const maxExpand = Math.round(Math.min(width, height) * 0.35);

  const lineMatchesSurface = (
    fixedCoord: number,
    isRow: boolean,
    from: number,
    to: number,
  ): boolean => {
    let matches = 0;
    let strongBorder = 0;
    let total = 0;
    for (let k = from; k <= to; k++) {
      const x = isRow ? k : fixedCoord;
      const y = isRow ? fixedCoord : k;
      const idx = y * width + x;
      if (matchesSurfaceRgb(rgba, idx * 4, surface)) matches++;
      if (grad[idx] >= 26) strongBorder++;
      total++;
    }
    if (total === 0) return false;
    return matches / total >= 0.56 && strongBorder / total < 0.35;
  };

  for (let step = 0; step < maxExpand && minY > 0; step++) {
    if (!lineMatchesSurface(minY - 1, true, minX, maxX)) break;
    minY--;
  }
  for (let step = 0; step < maxExpand && maxY < height - 1; step++) {
    if (!lineMatchesSurface(maxY + 1, true, minX, maxX)) break;
    maxY++;
  }
  for (let step = 0; step < maxExpand && minX > 0; step++) {
    if (!lineMatchesSurface(minX - 1, false, minY, maxY)) break;
    minX--;
  }
  for (let step = 0; step < maxExpand && maxX < width - 1; step++) {
    if (!lineMatchesSurface(maxX + 1, false, minY, maxY)) break;
    maxX++;
  }

  return { minX, minY, maxX, maxY };
}

function locateDocumentBox(
  rgba: Uint8Array | Uint8ClampedArray,
  grad: Uint8Array,
  width: number,
  height: number,
): BoxGeometry | null {
  const rowEnergy = new Float32Array(height);
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = 1; x < width - 1; x++) {
      const g = grad[row + x];
      sum += g >= 16 ? Math.min(48, g) : 0;
    }
    rowEnergy[y] = sum / Math.max(1, width - 2);
  }

  const smoothRows = smooth1D(rowEnergy, 2);
  const spanY = findDominantSpan(
    smoothRows,
    Math.max(3, Math.round(height * 0.05)),
    3.0,
    0.18,
  );
  if (!spanY || spanY.end - spanY.start + 1 < height * 0.08) {
    return null;
  }

  // First find the densest column seed inside spanY to reliably sample the document's paper/card color.
  const colEnergy = new Float32Array(width);
  const bandHeight = Math.max(1, spanY.end - spanY.start + 1);
  for (let x = 1; x < width - 1; x++) {
    let sum = 0;
    for (let y = spanY.start; y <= spanY.end; y++) {
      const g = grad[y * width + x];
      sum += g >= 16 ? Math.min(48, g) : 0;
    }
    colEnergy[x] = sum / bandHeight;
  }

  const smoothCols = smooth1D(colEnergy, 2);
  const seedSpanX = findDominantSpan(
    smoothCols,
    Math.max(3, Math.round(width * 0.05)),
    2.5,
    0.15,
  );
  if (!seedSpanX || seedSpanX.end - seedSpanX.start + 1 < width * 0.05) {
    return null;
  }

  // Combine gradient energy with paper/card surface continuity so blank gutters inside
  // the document (e.g. between header, photo, and fields) stay connected across the full card.
  const coreSurface = estimateSurfaceColor(
    rgba,
    width,
    seedSpanX.start,
    spanY.start,
    seedSpanX.end,
    spanY.end,
  );
  const combinedCols = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    let surfCount = 0;
    for (let y = spanY.start; y <= spanY.end; y++) {
      if (matchesSurfaceRgb(rgba, (y * width + x) * 4, coreSurface)) {
        surfCount++;
      }
    }
    const surfRatio = surfCount / bandHeight;
    combinedCols[x] = Math.max(
      smoothCols[x],
      surfRatio >= 0.42 ? 8 + surfRatio * 12 : 0,
    );
  }

  const spanX = findDominantSpan(
    smooth1D(combinedCols, 1),
    Math.max(4, Math.round(width * 0.08)),
    5.0,
    0.16,
  );
  if (!spanX || spanX.end - spanX.start + 1 < width * 0.08) {
    return null;
  }

  // Re-tighten Y across the full document width while bridging blank paragraph spaces on matching paper.
  const refinedRowEnergy = new Float32Array(height);
  const bandWidth = Math.max(1, spanX.end - spanX.start + 1);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    let surfCount = 0;
    for (let x = spanX.start; x <= spanX.end; x++) {
      const idx = row + x;
      const g = grad[idx];
      sum += g >= 16 ? Math.min(48, g) : 0;
      if (matchesSurfaceRgb(rgba, idx * 4, coreSurface)) {
        surfCount++;
      }
    }
    const avgGrad = sum / bandWidth;
    const surfRatio = surfCount / bandWidth;
    refinedRowEnergy[y] = Math.max(
      avgGrad,
      surfRatio >= 0.52 ? 5 + surfRatio * 8 : 0,
    );
  }
  const refinedSpanY =
    findDominantSpan(
      smooth1D(refinedRowEnergy, 1),
      Math.max(3, Math.round(height * 0.05)),
      4.5,
      0.16,
    ) ?? spanY;

  const { minX, minY, maxX, maxY } = expandToDocumentMargins(
    rgba,
    grad,
    width,
    height,
    spanX,
    refinedSpanY,
  );

  // Compute moments from high-activity or surface-matching pixels inside the box for skew & centroid.
  const surface = estimateSurfaceColor(rgba, width, minX, minY, maxX, maxY);
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  const activePts: number[] = [];

  for (let y = minY; y <= maxY; y++) {
    const row = y * width;
    for (let x = minX; x <= maxX; x++) {
      const idx = row + x;
      const p = idx * 4;
      const dist =
        (Math.abs(rgba[p] - surface.r) +
          Math.abs(rgba[p + 1] - surface.g) +
          Math.abs(rgba[p + 2] - surface.b)) /
        3;
      if (grad[idx] >= 20 || dist <= 32) {
        sumX += x;
        sumY += y;
        activePts.push(idx);
        count++;
      }
    }
  }

  if (count < 16) {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    return {
      minX,
      minY,
      maxX,
      maxY,
      cx,
      cy,
      skewDegrees: 0,
      principalAspect: Math.max(bw, bh) / Math.max(1, Math.min(bw, bh)),
    };
  }

  const cx = sumX / count;
  const cy = sumY / count;
  let mu20 = 0;
  let mu02 = 0;
  let mu11 = 0;

  for (let i = 0; i < activePts.length; i++) {
    const idx = activePts[i];
    const dx = (idx % width) - cx;
    const dy = Math.floor(idx / width) - cy;
    mu20 += dx * dx;
    mu02 += dy * dy;
    mu11 += dx * dy;
  }
  mu20 /= count;
  mu02 /= count;
  mu11 /= count;

  const thetaRad = 0.5 * Math.atan2(2 * mu11, mu20 - mu02);
  const absDeg = Math.abs((thetaRad * 180) / Math.PI);
  const skewDegrees = Math.min(absDeg, Math.abs(90 - absDeg));

  const common = Math.sqrt((mu20 - mu02) ** 2 + 4 * mu11 * mu11);
  const lambda1 = (mu20 + mu02 + common) / 2;
  const lambda2 = Math.max(1e-6, (mu20 + mu02 - common) / 2);
  const principalAspect = Math.sqrt(lambda1 / lambda2);

  return {
    minX,
    minY,
    maxX,
    maxY,
    cx,
    cy,
    skewDegrees,
    principalAspect,
  };
}

function measureBorderSurfaceContinuity(
  rgba: Uint8Array | Uint8ClampedArray,
  grad: Uint8Array,
  width: number,
  height: number,
  box: BoxGeometry,
): Record<FramingEdge, boolean> {
  const surface = estimateSurfaceColor(
    rgba,
    width,
    box.minX,
    box.minY,
    box.maxX,
    box.maxY,
  );
  // Check the outermost 2px rim so a valid document border 2-3px inside is not treated as clipped.
  const rim = 2;

  const checkEdge = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): boolean => {
    let surfMatch = 0;
    let innerEdgeActivity = 0;
    let total = 0;

    for (let y = y0; y <= y1; y++) {
      const row = y * width;
      for (let x = x0; x <= x1; x++) {
        const idx = row + x;
        const p = idx * 4;
        const dist =
          (Math.abs(rgba[p] - surface.r) +
            Math.abs(rgba[p + 1] - surface.g) +
            Math.abs(rgba[p + 2] - surface.b)) /
          3;
        if (dist <= 28) surfMatch++;
        if (grad[idx] >= 30) innerEdgeActivity++;
        total++;
      }
    }
    if (total === 0) return false;
    const surfRatio = surfMatch / total;
    const edgeRatio = innerEdgeActivity / total;
    // Document is clipped only if its surface continues flush onto the outermost rim
    // (or text/content lines cross the rim alongside matching document surface).
    return surfRatio >= 0.62 || (surfRatio >= 0.4 && edgeRatio >= 0.14);
  };

  return {
    top: checkEdge(box.minX, 0, box.maxX, Math.min(height - 1, rim - 1)),
    bottom: checkEdge(
      box.minX,
      Math.max(0, height - rim),
      box.maxX,
      height - 1,
    ),
    left: checkEdge(0, box.minY, Math.min(width - 1, rim - 1), box.maxY),
    right: checkEdge(Math.max(0, width - rim), box.minY, width - 1, box.maxY),
  };
}

/**
 * Evaluates document framing (area coverage, border clipping, centering,
 * skew angle, and aspect ratio) from an RGBA pixel buffer.
 */
export function analyzeDocumentFraming(
  image: RgbaImageLike,
  userConfig?: DocumentFramingProfile | Partial<DocumentFramingConfig>,
): DocumentFramingResult {
  const t0 = nowMs();
  const cfg = resolveFramingConfig(userConfig);
  const activeProfile: ActiveFramingProfile =
    cfg.profile === 'off' ? 'auto' : cfg.profile;
  const isPt = cfg.locale === 'pt-BR';

  const emptyMetrics = (elapsedMs: number): DocumentFramingMetrics => ({
    boundingBox: null,
    areaCoverage: 0,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    clippedEdges: [],
    centerOffset: 0,
    aspectRatio: 0,
    skewDegrees: 0,
    isFullPageScan: false,
    elapsedMs: roundTo(elapsedMs, 1),
  });

  if (
    image.width <= 0 ||
    image.height <= 0 ||
    image.data.length < image.width * image.height * 4
  ) {
    return {
      status: 'insufficient',
      profile: activeProfile,
      label: isPt ? 'Enquadramento Indisponível' : 'Framing Unavailable',
      reason: isPt
        ? 'Buffer de imagem inválido ou vazio.'
        : 'Invalid or empty image buffer.',
      score: 0,
      issues: [],
      metrics: emptyMetrics(nowMs() - t0),
    };
  }

  const prepared = resizeRgbaIfNeeded(image, cfg.maxAnalysisDim);
  const { width, height, data } = prepared;
  const { lum, contrast, stdDev } = toGrayscaleLuminance(data, width, height);

  if (width < 24 || height < 24 || contrast < 20 || stdDev < 4.5) {
    return {
      status: 'insufficient',
      profile: activeProfile,
      label: isPt ? 'Conteúdo Insuficiente' : 'Insufficient Content',
      reason: isPt
        ? 'Imagem em branco ou sem contraste suficiente para identificar o documento.'
        : 'Blank image or insufficient contrast to locate a document.',
      score: 0,
      issues: [],
      metrics: emptyMetrics(nowMs() - t0),
    };
  }

  const grad = computeSobelGradient(lum, width, height);
  const edgeStats = computeEdgeStats(lum, grad, width, height);
  const edges: FramingEdge[] = ['top', 'right', 'bottom', 'left'];

  // Clean full-page scans / PDF pages have quiet, uniform bright paper along all 4 borders.
  const isFullPageScan = edges.every(
    e =>
      edgeStats[e].meanLum >= 180 &&
      edgeStats[e].stdLum < 22 &&
      edgeStats[e].strongEdgeRatio < 0.08,
  );

  if (isFullPageScan) {
    const aspectRatio = Math.max(width, height) / Math.min(width, height);
    const issues: string[] = [];
    let score = 100;

    if (
      activeProfile !== 'auto' &&
      (aspectRatio < cfg.minAspectRatio || aspectRatio > cfg.maxAspectRatio)
    ) {
      score -= 25;
      issues.push(
        isPt
          ? `Proporção (${roundTo(aspectRatio)}:1) diferente do esperado para ${
              PROFILE_LABELS[cfg.locale][activeProfile]
            }.`
          : `Aspect ratio (${roundTo(aspectRatio)}:1) differs from expected ${
              PROFILE_LABELS[cfg.locale][activeProfile]
            }.`,
      );
    }

    const status: FramingStatus = issues.length > 0 ? 'warning' : 'good';
    return {
      status,
      profile: activeProfile,
      label:
        status === 'good'
          ? isPt
            ? 'Enquadramento Adequado'
            : 'Good Framing'
          : isPt
          ? 'Proporção Atípica'
          : 'Unusual Aspect Ratio',
      reason:
        issues[0] ??
        (isPt
          ? 'Documento digitalizado ou página completa com margens preservadas.'
          : 'Clean full-page scan or PDF with preserved margins.'),
      score,
      issues,
      metrics: {
        boundingBox: { x: 0, y: 0, width: 1, height: 1 },
        areaCoverage: 1,
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        clippedEdges: [],
        centerOffset: 0,
        aspectRatio: roundTo(aspectRatio),
        skewDegrees: 0,
        isFullPageScan: true,
        elapsedMs: roundTo(nowMs() - t0, 1),
      },
    };
  }

  const box = locateDocumentBox(data, grad, width, height);
  if (!box) {
    return {
      status: 'poor',
      profile: activeProfile,
      label: isPt ? 'Documento Não Detectado' : 'Document Not Detected',
      reason: isPt
        ? 'Não foi possível localizar o documento na imagem. Aproxime e use boa iluminação.'
        : 'Could not locate a document in the image. Move closer with even lighting.',
      score: 20,
      issues: [
        isPt
          ? 'Baixo contraste de texto ou bordas na área central.'
          : 'Low text or border contrast in the capture area.',
      ],
      metrics: emptyMetrics(nowMs() - t0),
    };
  }

  const normX = box.minX / width;
  const normY = box.minY / height;
  const normW = (box.maxX - box.minX + 1) / width;
  const normH = (box.maxY - box.minY + 1) / height;

  const margins: Record<FramingEdge, number> = {
    top: clamp01(normY),
    left: clamp01(normX),
    bottom: clamp01(1 - (normY + normH)),
    right: clamp01(1 - (normX + normW)),
  };

  const borderContinuity = measureBorderSurfaceContinuity(
    data,
    grad,
    width,
    height,
    box,
  );
  const clippedEdges = edges.filter(
    edge => margins[edge] <= cfg.minEdgeMarginRatio && borderContinuity[edge],
  );

  const areaCoverage = clamp01(normW * normH);
  const normCx = box.cx / width;
  const normCy = box.cy / height;
  const centerOffset = Math.hypot(normCx - 0.5, normCy - 0.5);

  const bwPx = box.maxX - box.minX + 1;
  const bhPx = box.maxY - box.minY + 1;
  const bboxAspect = Math.max(bwPx, bhPx) / Math.max(1, Math.min(bwPx, bhPx));
  const aspectRatio = box.skewDegrees > 10 ? box.principalAspect : bboxAspect;

  const issues: string[] = [];
  let score = 100;

  if (clippedEdges.length > 0) {
    score -= Math.min(55, clippedEdges.length * 25);
    const edgeNames = clippedEdges
      .map(e => EDGE_LABELS[cfg.locale][e])
      .join(', ');
    issues.push(
      isPt
        ? `Documento cortado ou rente à borda (${edgeNames}). Afaste um pouco a câmera para mostrar os 4 cantos.`
        : `Document clipped at frame edge (${edgeNames}). Move back slightly to capture all 4 corners.`,
    );
  }

  if (areaCoverage < cfg.minAreaCoverage) {
    const deficit = (cfg.minAreaCoverage - areaCoverage) / cfg.minAreaCoverage;
    score -= Math.round(20 + deficit * 25);
    issues.push(
      isPt
        ? `Documento muito distante (${Math.round(
            areaCoverage * 100,
          )}% do quadro). Aproxime a câmera.`
        : `Document too far (${Math.round(
            areaCoverage * 100,
          )}% of frame). Move closer.`,
    );
  }

  if (box.skewDegrees > cfg.maxSkewDegrees) {
    const excess = Math.min(1, (box.skewDegrees - cfg.maxSkewDegrees) / 25);
    score -= Math.round(12 + excess * 18);
    issues.push(
      isPt
        ? `Documento inclinado (~${Math.round(
            box.skewDegrees,
          )}°). Alinhe paralelamente ao quadro.`
        : `Document tilted (~${Math.round(
            box.skewDegrees,
          )}°). Align parallel to the frame.`,
    );
  }

  if (centerOffset > cfg.maxCenterOffsetRatio) {
    score -= 15;
    issues.push(
      isPt
        ? 'Documento descentralizado. Centralize na área de captura.'
        : 'Document off-center. Center it within the capture area.',
    );
  }

  if (
    activeProfile !== 'auto' &&
    clippedEdges.length === 0 &&
    (aspectRatio < cfg.minAspectRatio || aspectRatio > cfg.maxAspectRatio)
  ) {
    score -= 20;
    issues.push(
      isPt
        ? `Proporção detectada (${roundTo(
            aspectRatio,
          )}:1) fora do padrão esperado para ${
            PROFILE_LABELS[cfg.locale][activeProfile]
          }.`
        : `Detected aspect ratio (${roundTo(
            aspectRatio,
          )}:1) outside expected range for ${
            PROFILE_LABELS[cfg.locale][activeProfile]
          }.`,
    );
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let status: FramingStatus = 'good';
  if (
    clippedEdges.length > 0 ||
    areaCoverage < cfg.minAreaCoverage * 0.78 ||
    score < 55
  ) {
    status = 'poor';
  } else if (issues.length > 0 || score < 80) {
    status = 'warning';
  }

  let label: string;
  if (status === 'good') {
    label = isPt ? 'Enquadramento Adequado' : 'Good Framing';
  } else if (status === 'warning') {
    label = isPt ? 'Ajuste de Enquadramento' : 'Adjust Framing';
  } else if (clippedEdges.length > 0) {
    label = isPt ? 'Documento Cortado' : 'Clipped Document';
  } else {
    label = isPt ? 'Enquadramento Inadequado' : 'Poor Framing';
  }

  const reason =
    issues[0] ??
    (isPt
      ? `Documento bem enquadrado (${Math.round(
          areaCoverage * 100,
        )}% do quadro, bordas preservadas).`
      : `Document well framed (${Math.round(
          areaCoverage * 100,
        )}% of frame, edges preserved).`);

  return {
    status,
    profile: activeProfile,
    label,
    reason,
    score,
    issues,
    metrics: {
      boundingBox: {
        x: roundTo(normX, 3),
        y: roundTo(normY, 3),
        width: roundTo(normW, 3),
        height: roundTo(normH, 3),
      },
      areaCoverage: roundTo(areaCoverage, 3),
      margins: {
        top: roundTo(margins.top, 3),
        right: roundTo(margins.right, 3),
        bottom: roundTo(margins.bottom, 3),
        left: roundTo(margins.left, 3),
      },
      clippedEdges,
      centerOffset: roundTo(centerOffset, 3),
      aspectRatio: roundTo(aspectRatio, 2),
      skewDegrees: roundTo(box.skewDegrees, 1),
      isFullPageScan: false,
      elapsedMs: roundTo(nowMs() - t0, 1),
    },
  };
}
