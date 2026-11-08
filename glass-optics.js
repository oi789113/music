/**
 * Rounded glass lens optics, independent of the DOM and of blur filters.
 *
 * The field follows the analytic normal of a rounded rectangle. A quarter-circle
 * bevel supplies a surface angle; Snell's law gives the ray's deflection. Its
 * lateral travel is normalized to the requested visual displacement. Both ends
 * of the bevel are eased to keep the inner clear pane free of a derivative seam.
 *
 * SVG feDisplacementMap samples SourceGraphic at (x + dx, y + dy). Therefore an
 * inward sample vector magnifies the scenery near the perimeter. No turbulence,
 * random noise, Gaussian blur, or cloned page content is used here.
 */
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (min, max, value) => {
  const t = clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
};
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

/** Signed distance (< 0 inside) and the outward unit normal, in CSS pixels. */
export function roundedRectDistanceNormal(x, y, width, height, radius) {
  const halfWidth = width / 2, halfHeight = height / 2;
  const r = clamp(radius, 0, Math.min(halfWidth, halfHeight));
  const px = x - halfWidth, py = y - halfHeight;
  const qx = Math.abs(px) - (halfWidth - r);
  const qy = Math.abs(py) - (halfHeight - r);
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  const outsideLength = Math.hypot(ox, oy);
  const distance = outsideLength + Math.min(Math.max(qx, qy), 0) - r;
  let nx = 0, ny = 0;
  if (outsideLength > 1e-8) {
    nx = Math.sign(px) * ox / outsideLength;
    ny = Math.sign(py) * oy / outsideLength;
  } else if (qx > qy) {
    nx = Math.sign(px);
  } else if (qy > qx) {
    ny = Math.sign(py);
  } else {
    // The medial-axis normal is not unique, but the edge field is already zero.
    const length = Math.hypot(px, py);
    if (length) { nx = px / length; ny = py / length; }
  }
  return { distance, nx, ny };
}

function bevelTravel(t, ior) {
  if (t <= 0 || t >= 1) return 0;
  const surfaceHeight = Math.sqrt(t * (2 - t));
  const incidence = Math.asin(1 - t);
  const transmission = Math.asin(Math.sin(incidence) / ior);
  const travel = surfaceHeight * Math.tan(incidence - transmission);
  // Zero displacement and derivative at the outer antialias edge and clear pane.
  return travel * smoothstep(0, .06, t) * smoothstep(0, 1, 1 - t);
}

function settings(options = {}) {
  const width = Math.max(1, Math.round(finite(options.width, 1000)));
  const height = Math.max(1, Math.round(finite(options.height, 84)));
  const radius = clamp(finite(options.radius, 28), 0, Math.min(width, height) / 2);
  const edgeBand = clamp(finite(options.edgeBand, 18), .25, Math.max(.25, Math.min(radius || 1, height / 2, width / 2)));
  const displacement = clamp(finite(options.displacement, 22), 0, 80);
  const zoom = clamp(finite(options.zoom, 1), 1, 1.02);
  const ior = clamp(finite(options.ior, 1.5), 1.01, 2.5);
  let peak = 0;
  for (let i = 1; i < 512; i++) peak = Math.max(peak, bevelTravel(i / 512, ior));
  const maxZoomShift = Math.max(width, height) / 2 * (1 - 1 / zoom);
  const range = Math.max(displacement, maxZoomShift, .001);
  return { width, height, radius, edgeBand, displacement, zoom, ior, peak, range };
}

function sample(x, y, options) {
  const { width, height, radius, edgeBand, displacement, zoom, ior, peak } = options;
  const normal = roundedRectDistanceNormal(x, y, width, height, radius);
  const coverage = clamp(.5 - normal.distance, 0, 1);
  if (normal.distance >= 0) return { dx: 0, dy: 0, ...normal, coverage };
  const t = clamp(-normal.distance / edgeBand, 0, 1);
  const edge = clamp(bevelTravel(t, ior) / peak, 0, 1);
  const core = (1 - edge) * smoothstep(0, 1, t);
  const magnification = (1 - 1 / zoom) * core;
  return {
    dx: -normal.nx * displacement * edge + (width / 2 - x) * magnification,
    dy: -normal.ny * displacement * edge + (height / 2 - y) * magnification,
    ...normal,
    coverage
  };
}

/** Inspect the analytic mapping at any point without allocating a bitmap. */
export function sampleGlassDisplacement(x, y, options = {}) {
  return sample(x, y, settings(options));
}

/**
 * Build an opaque RGBA map for canvas ImageData -> PNG -> SVG feImage.
 * Coordinates are CSS pixels and sample at each pixel center. Resize only when
 * the dock geometry changes; the optical field is static, so it needs no RAF.
 *
 * pixels: R encodes dx, G encodes dy, B = 128, A = 255. Outside the roundrect is
 * neutral. mask is separate antialiased shape coverage (do not put it in map A:
 * premultiplication would corrupt R/G). Clip the filtered element with the same
 * CSS border-radius, or use this mask when rendering with a custom compositor.
 *
 * Use scale as feDisplacementMap.scale and x/y selectors R/G. Run the feImage
 * through feComponentTransfer first, using channelSlope/channelIntercept for
 * both R and G. This maps the byte-neutral 128 to exactly 0.5; without it an
 * 8-bit SVG map has a small 0.086px bias at the default 44px scale.
 */
export function createGlassDisplacementMap(options = {}) {
  const config = settings(options);
  const { width, height, range } = config;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const mask = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const point = sample(x + .5, y + .5, config);
      const index = y * width + x, offset = index * 4;
      pixels[offset] = Math.round(128 + 127 * clamp(point.dx / range, -1, 1));
      pixels[offset + 1] = Math.round(128 + 127 * clamp(point.dy / range, -1, 1));
      pixels[offset + 2] = 128;
      pixels[offset + 3] = 255;
      mask[index] = Math.round(point.coverage * 255);
    }
  }
  return {
    width, height, radius: config.radius, edgeBand: config.edgeBand,
    pixels, mask, scale: range * 2,
    channelSlope: 255 / 254, channelIntercept: -1 / 254,
    displacement: config.displacement, zoom: config.zoom
  };
}
