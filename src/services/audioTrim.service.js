// Pure-JS audio trimming (no ffmpeg — Vercel functions don't ship one).
//
// Used to turn "audio too long" into "translate the first N seconds". Only
// container formats that can be cut safely without re-encoding are handled:
//   - Ogg (Opus / Vorbis)  — what WhatsApp voice notes are (.opus / .ogg).
//                            Cut on page boundaries, no re-encode.
//   - WAV (PCM)            — header rewritten around the first N seconds.
//   - MP3                  — cut at a frame boundary near the time offset.
// Anything else (m4a/mp4, aac, webm ...) returns null and the caller keeps
// the old "audio too long" rejection.

const SYNC_SEARCH_BYTES = 4096;

function detectFormat(buf) {
  if (buf.length < 12) return null;
  if (buf.toString("latin1", 0, 4) === "OggS") return "ogg";
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WAVE") return "wav";
  if (buf.toString("latin1", 0, 3) === "ID3") return "mp3";
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "mp3";
  return null;
}

// ---- Ogg ---------------------------------------------------------------

function readOggSampleRate(buf, firstPageEnd, firstPageDataStart) {
  const head = buf.subarray(firstPageDataStart, firstPageEnd);
  if (head.toString("latin1", 0, 8) === "OpusHead") return 48000; // granule is always 48 kHz
  if (head[0] === 0x01 && head.toString("latin1", 1, 7) === "vorbis") {
    const rate = head.readUInt32LE(12);
    return rate > 0 ? rate : null;
  }
  return null;
}

function trimOgg(buf, maxSeconds) {
  let offset = 0;
  let sampleRate = null;
  let preSkip = 0;
  let lastKeptEnd = 0;
  let lastKeptGranule = 0;

  while (offset + 27 <= buf.length) {
    if (buf.toString("latin1", offset, offset + 4) !== "OggS") return null;
    const segCount = buf[offset + 26];
    const tableEnd = offset + 27 + segCount;
    if (tableEnd > buf.length) break;
    let dataLen = 0;
    for (let i = 0; i < segCount; i += 1) dataLen += buf[offset + 27 + i];
    const pageEnd = tableEnd + dataLen;
    if (pageEnd > buf.length) break;

    if (sampleRate === null) {
      sampleRate = readOggSampleRate(buf, pageEnd, tableEnd);
      if (!sampleRate) return null;
      const head = buf.subarray(tableEnd, pageEnd);
      if (head.toString("latin1", 0, 8) === "OpusHead") preSkip = head.readUInt16LE(10);
    }

    const granule = buf.readBigInt64LE(offset + 6);
    // -1 means "no packet finishes on this page"; keep it with its neighbours.
    if (granule >= 0n) {
      const seconds = Number(granule - BigInt(preSkip)) / sampleRate;
      if (seconds > maxSeconds) break;
      lastKeptGranule = Number(granule - BigInt(preSkip));
    }
    lastKeptEnd = pageEnd;
    offset = pageEnd;
  }

  // Need the headers (2 pages) plus at least one audio page.
  if (lastKeptEnd === 0 || lastKeptGranule <= 0) return null;
  return { buffer: buf.subarray(0, lastKeptEnd), seconds: lastKeptGranule / sampleRate };
}

// ---- WAV ---------------------------------------------------------------

function trimWav(buf, maxSeconds) {
  let pos = 12;
  let byteRate = 0;
  let blockAlign = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("latin1", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const dataStart = pos + 8;
    if (id === "fmt ") {
      if (dataStart + 16 > buf.length) return null;
      byteRate = buf.readUInt32LE(dataStart + 8);
      blockAlign = buf.readUInt16LE(dataStart + 12);
    } else if (id === "data") {
      if (!byteRate || !blockAlign) return null;
      const available = Math.min(size, buf.length - dataStart);
      const wanted = Math.floor((maxSeconds * byteRate) / blockAlign) * blockAlign;
      const keep = Math.min(available, wanted);
      if (keep <= 0 || keep >= available) return null;
      const out = Buffer.concat([buf.subarray(0, dataStart), buf.subarray(dataStart, dataStart + keep)]);
      out.writeUInt32LE(out.length - 8, 4);
      out.writeUInt32LE(keep, pos + 4);
      return { buffer: out, seconds: keep / byteRate };
    }
    pos = dataStart + size + (size % 2);
  }
  return null;
}

// ---- MP3 ---------------------------------------------------------------

function trimMp3(buf, maxSeconds, durationSeconds) {
  if (!durationSeconds || durationSeconds <= maxSeconds) return null;

  let audioStart = 0;
  if (buf.toString("latin1", 0, 3) === "ID3" && buf.length > 10) {
    const size =
      ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    audioStart = 10 + size;
  }
  if (audioStart >= buf.length) return null;

  const target = audioStart + Math.floor(((buf.length - audioStart) * maxSeconds) / durationSeconds);
  const limit = Math.min(buf.length - 1, target + SYNC_SEARCH_BYTES);
  for (let i = target; i < limit; i += 1) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
      return { buffer: buf.subarray(0, i), seconds: maxSeconds };
    }
  }
  return { buffer: buf.subarray(0, target), seconds: maxSeconds };
}

/**
 * @param {Buffer} buffer            uploaded audio
 * @param {object} opts
 * @param {number} opts.maxSeconds   keep at most this much
 * @param {number} [opts.durationSeconds] total duration (needed for MP3)
 * @returns {{buffer: Buffer, seconds: number, format: string} | null}
 *          null = format unsupported / nothing to trim / trimming failed.
 */
export function trimAudioBuffer(buffer, { maxSeconds, durationSeconds } = {}) {
  try {
    const format = detectFormat(buffer);
    let result = null;
    if (format === "ogg") result = trimOgg(buffer, maxSeconds);
    else if (format === "wav") result = trimWav(buffer, maxSeconds);
    else if (format === "mp3") result = trimMp3(buffer, maxSeconds, durationSeconds);
    return result ? { ...result, format } : null;
  } catch (error) {
    console.error("[audioTrim] failed:", error.message);
    return null;
  }
}
