// Rendering helpers are bundled as browser source alongside atlasRuntime.
// Display interpolation never modifies the native NOAA grid used by readouts.
export function prepareTemperatureField(values) {
  const field = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    if (values[i] != null) { field[i] = values[i] / 10; continue; }
    const row = Math.floor(i / 180), col = i % 180;
    let total = 0, weight = 0;
    // Limited coastal extrapolation closes the coarse NOAA land-cell staircase.
    // Actual coastline masking is applied afterward. Remote gaps stay missing.
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const y = row + dy;
      if (y < 0 || y >= 89 || (!dx && !dy)) continue;
      const value = values[y * 180 + (col + dx + 180) % 180];
      if (value == null) continue;
      const w = 1 / (dx * dx + dy * dy);
      total += value / 10 * w; weight += w;
    }
    field[i] = weight ? total / weight : NaN;
  }
  return field;
}

export function smoothTemperatureAt(field, latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 88) return null;
  const y = (88 - latitude) / 2, x = ((longitude % 360 + 360) % 360) / 2;
  const row = Math.floor(y), col = Math.floor(x), fy = y - row, fx = x - col;
  let total = 0, weight = 0;
  for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
    const r = Math.min(88, row + dy), c = (col + dx) % 180;
    const value = field[r * 180 + c];
    const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
    if (Number.isFinite(value) && w > 0) { total += value * w; weight += w; }
  }
  return weight > .01 ? total / weight : null;
}

export function temperatureOpacity(zoom) {
  // A 2° climatology is useful regionally, but must not imply site-level
  // precision. Fade continuously as detailed street/coastal maps take over.
  return .62 * Math.max(0, Math.min(1, (10 - zoom) / 3));
}

export function decodeLand(data) {
  if (data?.type === 'FeatureCollection') return data;
  const scale = data?.scale;
  if (!Number.isFinite(scale) || !Array.isArray(data?.polygons)) throw new Error('Invalid bundled coastline');
  const decodeRing = encoded => {
    const points = [];
    let index = 0, x = 0, y = 0;
    const next = () => {
      let result = 0, shift = 0, byte;
      do {
        if (index >= encoded.length) throw new Error('Truncated bundled coastline');
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      return result & 1 ? ~(result >> 1) : result >> 1;
    };
    while (index < encoded.length) { x += next(); y += next(); points.push([x / scale, y / scale]); }
    return points;
  };
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {},
    geometry: { type: 'MultiPolygon', coordinates: data.polygons.map(polygon => polygon.map(decodeRing)) } }] };
}

export function createAtlasLayers(L, map, data, initialMonth) {
  const index = window.geojsonvt(decodeLand(data.land), { maxZoom: 10, indexMaxZoom: 5, indexMaxPoints: 50000, tolerance: 1.5, extent: 4096, buffer: 16 });
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const fields = new Map();
  let month = initialMonth;
  const getField = () => {
    if (!fields.has(month)) fields.set(month, prepareTemperatureField(data.temperature.months[month]));
    // Keep only the current/previous fields; rapid month changes stay bounded.
    if (fields.size > 2) fields.delete(fields.keys().next().value);
    return fields.get(month);
  };
  function coastlineTile(coords) {
    const z = Math.min(coords.z, 10), divisor = 2 ** (coords.z - z);
    return { tile: index.getTile(z, Math.floor(coords.x / divisor), Math.floor(coords.y / divisor)), divisor,
      offsetX: coords.x % divisor, offsetY: coords.y % divisor };
  }
  function paintLand(ctx, coords, fill, stroke) {
    const { tile, divisor, offsetX, offsetY } = coastlineTile(coords);
    if (!tile) return;
    ctx.save();
    ctx.scale(ratio, ratio);
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke || fill;
    ctx.lineWidth = .55;
    for (const feature of tile.features) {
      if (feature.type !== 3) continue;
      // Fill holes as well: inland lakes are not sea-surface-temperature data.
      for (const ring of feature.geometry) {
        ctx.beginPath();
        ring.forEach((point, i) => {
          const x = point[0] / 16 * divisor - offsetX * 256;
          const y = point[1] / 16 * divisor - offsetY * 256;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath(); ctx.fill(); if (stroke) ctx.stroke();
      }
    }
    ctx.restore();
  }
  const LandLayer = L.GridLayer.extend({
    createTile(coords) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256 * ratio;
      paintLand(canvas.getContext('2d'), coords, '#203943', '#3a5560');
      return canvas;
    },
  });
  const palette = [[102, 118, 207], [71, 154, 209], [82, 198, 186], [214, 213, 117], [247, 173, 101], [227, 106, 101]];
  const colors = Array.from({ length: 1024 }, (_, i) => {
    const at = i / 1023 * 4.999, j = Math.floor(at), f = at - j;
    return palette[j].map((v, c) => Math.round(v + f * (palette[j + 1][c] - v)));
  });
  function paintHeat(canvas, coords) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const field = getField();
    // One sample every two CSS pixels, plus a shared border. DrawImage performs
    // bilinear upsampling; global pixel coordinates keep adjacent tiles aligned.
    const size = 130, sample = document.createElement('canvas'); sample.width = sample.height = size;
    const sctx = sample.getContext('2d'), pixels = sctx.createImageData(size, size);
    const world = 256 * 2 ** coords.z;
    for (let y = 0; y < size; y++) {
      const py = coords.y * 256 + (y - 1) * 2 + 1;
      const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * py / world))) * 180 / Math.PI;
      for (let x = 0; x < size; x++) {
        const lon = (coords.x * 256 + (x - 1) * 2 + 1) / world * 360 - 180;
        const value = smoothTemperatureAt(field, lat, lon);
        if (value == null) continue;
        const color = colors[Math.max(0, Math.min(1023, Math.round(value / 32 * 1023)))];
        const i = (y * size + x) * 4;
        pixels.data[i] = color[0]; pixels.data[i + 1] = color[1]; pixels.data[i + 2] = color[2]; pixels.data[i + 3] = 255;
      }
    }
    sctx.putImageData(pixels, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sample, 1, 1, 128, 128, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-out';
    paintLand(ctx, coords, '#000');
    ctx.globalCompositeOperation = 'source-over';
    canvas.dataset.month = String(month);
  }
  const HeatLayer = L.GridLayer.extend({
    createTile(coords) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256 * ratio;
      canvas.atlasCoords = coords;
      paintHeat(canvas, coords);
      return canvas;
    },
    setMonth(next) {
      if (next === month) return;
      month = next;
      // Update in place in one frame. GridLayer.redraw() causes transparent
      // tiles to stack/fade, exposing seams and flashes on every UI update.
      if (this.getContainer()) this.getContainer().querySelectorAll('canvas').forEach(canvas => paintHeat(canvas, canvas.atlasCoords));
    },
  });
  const options = { tileSize: 256, keepBuffer: 1, updateWhenIdle: true, updateWhenZooming: false, bounds: [[-85.0511, -180], [85.0511, 180]] };
  return {
    land: new LandLayer({ ...options, pane: 'land' }),
    heat: new HeatLayer({ ...options, pane: 'temperature', maxZoom: 10 }),
  };
}
