// Losslessly-safe-as-possible re-compression of embedded JPEG images inside
// uploaded PDFs. This targets the specific waste found in third-party
// weekly publications (ArtScroll, Pirchei, etc.): large embedded photos and
// scanned graphics saved at a higher JPEG quality than necessary for
// print-at-home use.
//
// Scope is deliberately conservative:
// - Only images already encoded as JPEG (/DCTDecode) are touched. No other
//   image format is ever re-encoded.
// - CMYK JPEGs are always skipped. The codec used here (mozjpeg via
//   @jsquash/jpeg) only supports grayscale and RGB/YCbCr JPEGs; CMYK is
//   detected directly from the JPEG bitstream's own SOF marker (not the
//   PDF's /ColorSpace entry, which can be indirect or an ICC profile) and
//   skipped outright rather than risking a bad color conversion.
// - Any image used as another image's /SMask (a soft-mask / alpha channel)
//   is skipped, since lossy JPEG artifacts on a mask produce visible edge
//   haloing around transparent logos.
// - Small images (icons, decorative dividers) are skipped - the fixed
//   overhead of a WASM decode/encode round trip isn't worth it below a
//   size threshold, and there's essentially nothing to save.
// - A recompressed image only replaces the original if it's meaningfully
//   smaller (by at least MIN_SAVINGS_RATIO); otherwise the original bytes
//   are kept.
// - Any failure at any stage - for a single image or for the whole file -
//   falls back to leaving that image (or the whole file) untouched. This
//   step can never cause an upload to fail.
//
// The actual readable Torah text in these publications is vector text, not
// images, so none of this ever touches legibility of the content itself -
// only embedded photos/graphics.

const MIN_IMAGE_BYTES = 15_000; // below this, skip - not worth the overhead
const MIN_SAVINGS_RATIO = 0.15; // only replace if at least 15% smaller
const JPEG_QUALITY = 85;

type JpegCodec = {
  decode: (data: ArrayBuffer) => Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
  encode: (
    data: { width: number; height: number; data: Uint8ClampedArray },
    opts?: Record<string, unknown>,
  ) => Promise<ArrayBuffer>;
};

let codecPromise: Promise<JpegCodec> | null = null;

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = Buffer.from(b64, "base64");
  return bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
}

/**
 * Compile the mozjpeg decode/encode WASM once per isolate, from bundled
 * base64 constants (see src/lib/wasm/) rather than fetching from a CDN at
 * request time - fully self-contained, no runtime network dependency, and
 * no cold-start latency spent waiting on an external host.
 */
function getJpegCodec(): Promise<JpegCodec> {
  if (!codecPromise) {
    const promise = (async (): Promise<JpegCodec> => {
      const [decodeMod, encodeMod, { MOZJPEG_DEC_WASM_B64 }, { MOZJPEG_ENC_WASM_B64 }] = await Promise.all([
        import("@jsquash/jpeg/decode.js"),
        import("@jsquash/jpeg/encode.js"),
        import("@/lib/wasm/mozjpeg-dec-wasm-b64"),
        import("@/lib/wasm/mozjpeg-enc-wasm-b64"),
      ]);
      const [decModule, encModule] = await Promise.all([
        WebAssembly.compile(base64ToArrayBuffer(MOZJPEG_DEC_WASM_B64)),
        WebAssembly.compile(base64ToArrayBuffer(MOZJPEG_ENC_WASM_B64)),
      ]);
      await decodeMod.init(decModule);
      await encodeMod.init(encModule);
      // jsquash's real signature types decode/encode around the DOM
      // ImageData interface (which requires a `colorSpace` field). At
      // runtime the Workers/Node environment here has no `ImageData`
      // constructor and the actual decode() output is a plain
      // {width,height,data} object - functionally identical to what this
      // module needs, just not structurally typed the same. Safe to cast.
      return { decode: decodeMod.default, encode: encodeMod.default } as unknown as JpegCodec;
    })().catch((e) => {
      codecPromise = null;
      throw e;
    });
    codecPromise = promise;
    return promise;
  }
  return codecPromise;
}

/**
 * Reads the number of color components directly from a JPEG's own SOF
 * (Start Of Frame) marker. Returns null if it can't confidently be
 * determined (malformed/truncated data, unusual marker layout) - callers
 * treat that as "skip this image" rather than guessing.
 *
 * 1 component = grayscale, 3 = YCbCr/RGB (safe to re-encode with this
 * codec), 4 = CMYK/YCCK (must be skipped - the codec doesn't support it and
 * misreading Adobe's inverted CMYK convention would corrupt colors).
 */
function jpegComponentCount(bytes: Uint8Array): number | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null; // not a JPEG (SOI marker)
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null; // malformed marker stream
    const marker = bytes[offset + 1];
    // SOF0-SOF3, SOF5-SOF7, SOF9-SOF11, SOF13-SOF15 all carry the same
    // component-count field at the same offset; SOF markers other than
    // baseline (C0) / progressive (C2) aren't worth the risk here.
    if (marker === 0xc0 || marker === 0xc2) {
      const componentsOffset = offset + 2 + 2 + 1 + 2 + 2; // marker,len,precision,height,width -> components byte
      if (componentsOffset >= bytes.length) return null;
      return bytes[componentsOffset];
    }
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; } // SOI/EOI, no length field
    if (marker >= 0xd0 && marker <= 0xd7) { offset += 2; continue; } // RSTn, no length field
    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (segmentLength < 2) return null;
    offset += 2 + segmentLength;
  }
  return null;
}

type PdfLibModule = typeof import("pdf-lib");

async function optimizeOneImage(
  pdfLib: PdfLibModule,
  codec: JpegCodec,
  contents: Uint8Array,
): Promise<Uint8Array | null> {
  if (contents.length < MIN_IMAGE_BYTES) return null;
  const components = jpegComponentCount(contents);
  if (components !== 1 && components !== 3) return null; // skip CMYK/unknown

  const ab = contents.buffer.slice(
    contents.byteOffset,
    contents.byteOffset + contents.byteLength,
  ) as ArrayBuffer;
  const decoded = await codec.decode(ab);
  const colorSpace = components === 1 ? 1 : 3; // MozJpegColorSpace: 1=GRAYSCALE, 3=YCbCr
  const encoded = await codec.encode(decoded as any, {
    quality: JPEG_QUALITY,
    color_space: colorSpace,
  });
  const encodedBytes = new Uint8Array(encoded);
  if (encodedBytes.length >= contents.length * (1 - MIN_SAVINGS_RATIO)) return null;
  return encodedBytes;
}

/**
 * Attempts to shrink embedded JPEGs in a PDF's bytes. Always returns valid
 * PDF bytes - the original, untouched, if anything goes wrong or if there
 * was nothing safe to optimize.
 */
export async function optimizePdfImages(buf: Buffer): Promise<Buffer> {
  try {
    const pdfLib = await import("pdf-lib");
    const { PDFDocument, PDFName, PDFRawStream } = pdfLib;
    const doc = await PDFDocument.load(new Uint8Array(buf), {
      updateMetadata: false,
      ignoreEncryption: true,
    });
    const ctx = doc.context;

    // Collect every ref used as another image's /SMask so those are never
    // touched, even if they'd otherwise qualify (grayscale, big enough).
    const smaskRefs = new Set<string>();
    for (const [, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;
      const subtype = obj.dict.get(PDFName.of("Subtype"));
      if (!subtype || subtype.toString() !== "/Image") continue;
      const smask = obj.dict.get(PDFName.of("SMask"));
      if (smask && typeof (smask as any).toString === "function") {
        smaskRefs.add(smask.toString());
      }
    }

    let candidateCount = 0;
    let optimizedCount = 0;
    let savedBytes = 0;
    let codec: JpegCodec | null = null;

    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;
      const subtype = obj.dict.get(PDFName.of("Subtype"));
      if (!subtype || subtype.toString() !== "/Image") continue;
      if (smaskRefs.has(ref.toString())) continue; // never touch alpha masks
      if (obj.dict.get(PDFName.of("Decode"))) continue; // unusual colour remap present - skip for safety
      const filter = obj.dict.get(PDFName.of("Filter"));
      const filterStr = filter ? filter.toString() : "";
      if (!filterStr.includes("DCTDecode")) continue; // only touch already-JPEG images
      if (filterStr.includes("[") && !/^\[\s*\/DCTDecode\s*\]$/.test(filterStr)) continue; // skip stacked filters

      candidateCount++;
      try {
        if (!codec) codec = await getJpegCodec();
        const optimized = await optimizeOneImage(pdfLib, codec, obj.contents);
        if (!optimized) continue;
        savedBytes += obj.contents.length - optimized.length;
        optimizedCount++;
        // .contents is readonly on PDFRawStream - replace the whole object
        // in the context (reusing the same dict, so Width/Height/ColorSpace
        // stay untouched; /Length is recomputed automatically by pdf-lib
        // from the new contents when the document is saved).
        ctx.assign(ref, PDFRawStream.of(obj.dict, optimized));
      } catch (err) {
        // One bad image should never sink the whole upload - skip it.
        console.error("[optimizePdfImages] skipped one image after error", err);
      }
    }

    // Always re-save with object-stream packing, even if no images qualified
    // for recompression - this alone gives a modest, free, lossless size
    // reduction (measured 1.5-7.3% across real sample PDFs) on every upload.
    const outBytes = await doc.save({ useObjectStreams: true });
    if (optimizedCount > 0) {
      console.log(
        `[optimizePdfImages] ${optimizedCount}/${candidateCount} images optimized, ` +
          `${savedBytes.toLocaleString()} bytes saved`,
      );
    }
    if (outBytes.length > 0 && outBytes.length < buf.length) {
      return Buffer.from(outBytes);
    }
    return buf;
  } catch (err) {
    console.error("[optimizePdfImages] failed, using original file", err);
    return buf;
  }
}
