// Decode the packaged mono PCM reference without a remote MP3 decoder.
export function decodeReferenceWav(buffer) {
  const view = new DataView(buffer);
  const tag = (offset) => String.fromCharCode(...new Uint8Array(buffer, offset, 4));
  if (buffer.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Invalid voice WAV');
  let sampleRate = 0, dataOffset = 0, dataLength = 0;
  for (let offset = 12; offset + 8 <= buffer.byteLength;) {
    const length = view.getUint32(offset + 4, true);
    if (offset + 8 + length > buffer.byteLength) throw new Error('Truncated voice WAV');
    if (tag(offset) === 'fmt ') {
      if (length < 16 || view.getUint16(offset + 8, true) !== 1 || view.getUint16(offset + 10, true) !== 1 || view.getUint16(offset + 22, true) !== 16) throw new Error('Voice reference must be mono PCM16');
      sampleRate = view.getUint32(offset + 12, true);
    }
    if (tag(offset) === 'data') { dataOffset = offset + 8; dataLength = length; }
    offset += 8 + length + (length % 2);
  }
  if (sampleRate !== 24000 || dataLength < sampleRate * 2 || dataLength > sampleRate * 2 * 10 || dataLength % 2) throw new Error('Voice reference must be 1–10 seconds at 24 kHz');
  const pcm = new Float32Array(dataLength / 2);
  for (let index = 0; index < pcm.length; index++) pcm[index] = view.getInt16(dataOffset + index * 2, true) / 32768;
  return { pcm, sampleRate };
}
