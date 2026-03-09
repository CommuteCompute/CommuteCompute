/**
 * /api/fullscreen - Returns full screen as 1-bit BMP
 *
 * DEPRECATED: Debug/test endpoint that renders a static placeholder image.
 * Does not use journey data or the CommuteCompute engine.
 * For production dashboard rendering use:
 *   - /api/screen (TRMNL webhook)
 *   - /api/livedash (multi-device CC LiveDash)
 *
 * Consolidation: Duplicate getMelbourneTime/formatTime/formatDateParts
 * removed (unused). Unused imports (opendata-client, CommuteCompute,
 * CCDashRenderer, PreferencesManager) removed. Engine singleton removed.
 *
 * Optimised for ESP32 memory constraints.
 * Returns raw binary BMP data, not base64 encoded JSON.
 *
 * Query params:
 * - demo=<scenario>: Use demo scenario (reserved, not implemented)
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

import { createCanvas } from '@napi-rs/canvas';

const WIDTH = 800;
const HEIGHT = 480;

/**
 * Convert canvas to 1-bit BMP
 */
function canvasTo1BitBMP(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  const pixels = imageData.data;
  
  // BMP file structure for 1-bit image
  const rowBytes = Math.ceil(WIDTH / 8);
  const paddedRowBytes = Math.ceil(rowBytes / 4) * 4; // Rows must be multiple of 4 bytes
  const pixelDataSize = paddedRowBytes * HEIGHT;
  const fileSize = 62 + pixelDataSize; // 14 header + 40 DIB + 8 palette + pixels
  
  const buffer = Buffer.alloc(fileSize);
  let offset = 0;
  
  // BMP Header (14 bytes)
  buffer.write('BM', offset); offset += 2;
  buffer.writeUInt32LE(fileSize, offset); offset += 4;
  buffer.writeUInt32LE(0, offset); offset += 4; // Reserved
  buffer.writeUInt32LE(62, offset); offset += 4; // Pixel data offset
  
  // DIB Header (40 bytes)
  buffer.writeUInt32LE(40, offset); offset += 4; // DIB header size
  buffer.writeInt32LE(WIDTH, offset); offset += 4;
  buffer.writeInt32LE(-HEIGHT, offset); offset += 4; // Negative = top-down
  buffer.writeUInt16LE(1, offset); offset += 2; // Planes
  buffer.writeUInt16LE(1, offset); offset += 2; // Bits per pixel
  buffer.writeUInt32LE(0, offset); offset += 4; // Compression (none)
  buffer.writeUInt32LE(pixelDataSize, offset); offset += 4;
  buffer.writeInt32LE(2835, offset); offset += 4; // X pixels per meter
  buffer.writeInt32LE(2835, offset); offset += 4; // Y pixels per meter
  buffer.writeUInt32LE(2, offset); offset += 4; // Colors in palette
  buffer.writeUInt32LE(2, offset); offset += 4; // Important colors
  
  // Color palette (8 bytes) - Black and White
  buffer.writeUInt32LE(0x00000000, offset); offset += 4; // Black (index 0)
  buffer.writeUInt32LE(0x00FFFFFF, offset); offset += 4; // White (index 1)
  
  // Pixel data (1 bit per pixel, rows padded to 4 bytes)
  for (let y = 0; y < HEIGHT; y++) {
    let byte = 0;
    let bitIndex = 7;
    
    for (let x = 0; x < WIDTH; x++) {
      const idx = (y * WIDTH + x) * 4;
      // Convert to grayscale and threshold
      const gray = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
      const bit = gray > 128 ? 1 : 0; // 1 = white, 0 = black
      
      byte |= (bit << bitIndex);
      bitIndex--;
      
      if (bitIndex < 0) {
        buffer.writeUInt8(byte, offset++);
        byte = 0;
        bitIndex = 7;
      }
    }
    
    // Write any remaining bits
    if (bitIndex < 7) {
      buffer.writeUInt8(byte, offset++);
    }
    
    // Pad row to multiple of 4 bytes
    const bytesWritten = Math.ceil(WIDTH / 8);
    for (let p = bytesWritten; p < paddedRowBytes; p++) {
      buffer.writeUInt8(0, offset++);
    }
  }
  
  return buffer;
}

export default async function handler(req, res) {
  try {
    // Create a simple white canvas with "Hello" text
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    
    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    
    // Black text
    ctx.fillStyle = 'black';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText('Commute Compute', 200, 200);
    ctx.font = '32px sans-serif';
    ctx.fillText(new Date().toISOString(), 200, 280);
    
    // Convert to 1-bit BMP
    const bmpData = canvasTo1BitBMP(canvas);
    
    res.setHeader('Content-Type', 'image/bmp');
    res.setHeader('Content-Length', bmpData.length);
    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).send(bmpData);
    
  } catch (error) {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(500).send(`Error: ${error.message}`);
  }
}
