// Portable prepared-speaker container: JSON metadata + aligned binary tensors.
// Typed arrays, BigInt state and NaN padding retain their original bits.
const MAGIC = 'ATVP2\n';
const TYPES = { Float32Array, BigInt64Array, Uint8Array };
export function encodeVoiceProfile(profile) {
  const tensors = [];
  let length = 0;
  const header = new TextEncoder().encode(JSON.stringify(profile, (_key, value) => {
    if (!ArrayBuffer.isView(value)) return value;
    const type = value.constructor.name;
    if (!TYPES[type]) throw new Error('Unsupported speaker tensor');
    length = Math.ceil(length / 8) * 8;
    const offset = length;
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    tensors.push({ offset, bytes }); length += bytes.byteLength;
    return { $atlasTensor: type, offset, bytes: bytes.byteLength };
  }));
  const start = Math.ceil((10 + header.byteLength) / 8) * 8;
  const buffer = new ArrayBuffer(start + length);
  const bytes = new Uint8Array(buffer);
  bytes.set(new TextEncoder().encode(MAGIC));
  new DataView(buffer).setUint32(6, header.byteLength, true);
  bytes.set(header, 10);
  for (const tensor of tensors) bytes.set(tensor.bytes, start + tensor.offset);
  return buffer;
}
export function decodeVoiceProfile(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 10 || buffer.byteLength > 16 * 1024 * 1024 || new TextDecoder().decode(new Uint8Array(buffer, 0, 6)) !== MAGIC) throw new Error('Invalid prepared voice file');
  const headerLength = new DataView(buffer).getUint32(6, true);
  const start = Math.ceil((10 + headerLength) / 8) * 8;
  if (headerLength > 1024 * 1024 || start > buffer.byteLength) throw new Error('Invalid prepared voice header');
  return JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 10, headerLength)), (_key, value) => {
    if (!value?.$atlasTensor) return value;
    const Type = TYPES[value.$atlasTensor];
    if (!Type || !Number.isSafeInteger(value.offset) || value.offset < 0 || !Number.isSafeInteger(value.bytes) || value.bytes < 0 || value.bytes % Type.BYTES_PER_ELEMENT || value.offset + value.bytes > buffer.byteLength - start) throw new Error('Invalid prepared voice payload');
    return new Type(buffer.slice(start + value.offset, start + value.offset + value.bytes));
  });
}
