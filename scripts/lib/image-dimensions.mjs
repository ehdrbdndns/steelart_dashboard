import { Buffer } from "node:buffer";

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

function ensurePositiveDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("유효하지 않은 이미지 크기입니다.");
  }

  return { width, height };
}

function parsePngDimensions(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("PNG 시그니처를 찾을 수 없습니다.");
  }

  return ensurePositiveDimensions(buffer.readUInt32BE(16), buffer.readUInt32BE(20));
}

function parseGifDimensions(buffer) {
  const header = buffer.subarray(0, 6).toString("ascii");
  if (buffer.length < 10 || (header !== "GIF87a" && header !== "GIF89a")) {
    throw new Error("GIF 시그니처를 찾을 수 없습니다.");
  }

  return ensurePositiveDimensions(buffer.readUInt16LE(6), buffer.readUInt16LE(8));
}

function parseJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error("JPEG 시그니처를 찾을 수 없습니다.");
  }

  let offset = 2;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < buffer.length && buffer[offset] === 0xff) {
      offset += 1;
    }

    if (offset >= buffer.length) {
      break;
    }

    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    if (offset + 1 >= buffer.length) {
      break;
    }

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      break;
    }

    if (JPEG_SOF_MARKERS.has(marker)) {
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      return ensurePositiveDimensions(width, height);
    }

    offset += segmentLength;
  }

  throw new Error("JPEG 크기 정보를 찾을 수 없습니다.");
}

export function getImageDimensions(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
    return parsePngDimensions(buffer);
  }

  const gifHeader = buffer.subarray(0, 6).toString("ascii");
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
    return parseGifDimensions(buffer);
  }

  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return parseJpegDimensions(buffer);
  }

  throw new Error("지원하지 않는 이미지 포맷입니다. PNG/JPEG/GIF만 처리할 수 있습니다.");
}

export async function fetchImageDimensions(imageUrl) {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`이미지를 불러오지 못했습니다. (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return getImageDimensions(Buffer.from(arrayBuffer));
}
