import { inflateSync } from "node:zlib";

/** Validate the extracted 8-bit RGBA PNGs before adding database media records. */
export function inspectTransparentPng(buffer: Buffer, options: { opaqueBodyPoint?: { x: number; y: number } } = {}): { pixelWidth: number; pixelHeight: number } {
  if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Asset is not a PNG.");
  let pixelWidth = 0;
  let pixelHeight = 0;
  const data: Buffer[] = [];
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (offset + size + 12 > buffer.length) throw new Error("Truncated PNG.");
    const chunk = buffer.subarray(offset + 8, offset + 8 + size);
    if (type === "IHDR") {
      if (size !== 13 || chunk[8] !== 8 || chunk[9] !== 6 || chunk[10] || chunk[11] || chunk[12]) throw new Error("Expected a non-interlaced 8-bit RGBA PNG.");
      pixelWidth = chunk.readUInt32BE(0);
      pixelHeight = chunk.readUInt32BE(4);
    }
    if (type === "IDAT") data.push(chunk);
    offset += size + 12;
    if (type === "IEND") break;
  }
  if (!pixelWidth || !pixelHeight || pixelWidth * pixelHeight > 40_000_000) throw new Error("PNG dimensions are missing or too large.");
  const rowBytes = pixelWidth * 4;
  const expected = (rowBytes + 1) * pixelHeight;
  const decoded = inflateSync(Buffer.concat(data), { maxOutputLength: expected });
  if (decoded.length !== expected) throw new Error("PNG pixel data length is invalid.");
  let previous = Buffer.alloc(rowBytes);
  let transparent = false;
  let visible = false;
  const point = options.opaqueBodyPoint;
  if (point && (![point.x, point.y].every(Number.isFinite) || point.x < 0 || point.x >= 1 || point.y < 0 || point.y >= 1)) throw new Error("Opaque body sample must lie inside the image.");
  const sampleX = point ? Math.floor(point.x * pixelWidth) : -1;
  const sampleY = point ? Math.floor(point.y * pixelHeight) : -1;
  let bodyAlpha: number | undefined;
  for (let y = 0; y < pixelHeight; y++) {
    const start = y * (rowBytes + 1);
    const filter = decoded[start];
    if (filter > 4) throw new Error("PNG filter is invalid.");
    const row = Buffer.from(decoded.subarray(start + 1, start + 1 + rowBytes));
    for (let x = 0; x < rowBytes; x++) {
      const left = x >= 4 ? row[x - 4] : 0;
      const up = previous[x];
      const upperLeft = x >= 4 ? previous[x - 4] : 0;
      let prediction = 0;
      if (filter === 1) prediction = left;
      if (filter === 2) prediction = up;
      if (filter === 3) prediction = Math.floor((left + up) / 2);
      if (filter === 4) {
        const p = left + up - upperLeft;
        const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - upperLeft);
        prediction = a <= b && a <= c ? left : b <= c ? up : upperLeft;
      }
      row[x] = (row[x] + prediction) & 255;
      if (x % 4 === 3) {
        transparent ||= row[x] === 0;
        visible ||= row[x] > 0;
        if (point && y === sampleY && Math.floor(x / 4) === sampleX) bodyAlpha = row[x];
      }
    }
    previous = row;
  }
  if (!transparent || !visible) throw new Error("PNG must contain both transparent background and visible part pixels.");
  if (point && bodyAlpha !== 255) throw new Error("PNG component body must be fully opaque at the declared interior sample.");
  return { pixelWidth, pixelHeight };
}
