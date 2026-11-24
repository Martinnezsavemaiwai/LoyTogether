import { liftPercent, spriteLayers } from '@/features/krathong/KrathongArt';
import type { River } from '@/features/rivers/rivers';
import type { Krathong } from '@/types/domain';

/**
 * Memory card: a 1080x1350 (4:5) JPEG for sharing after floating. It shows the venue
 * backdrop, the visitor's own krathong, its name, who floated it, the place and date,
 * and the wish only when it is public. A private wish is never drawn, even for its owner.
 */

export const CARD_W = 1080;
export const CARD_H = 1350;

const FONT = '"IBM Plex Sans Thai", "Noto Sans Thai", sans-serif';
const INK = '#FFF9EC';
const MIST = '#A7AEC4';
const GOLD = '#F5C76A';
const NIGHT = '9, 13, 28';
const SIDE = 72;

export interface MemoryCardInput {
  krathong: Krathong;
  river: River;
  /** Private or couple room title, shown instead of the venue name. */
  placeTitle?: string | null;
  host: string;
}

/** Splits text into lines no wider than `maxWidth`, breaking between Thai words. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const words = segmentWords(text);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (word === '\n') {
      lines.push(line.trimEnd());
      line = '';
      continue;
    }
    const next = line + word;
    if (measure(next.trimEnd()) <= maxWidth || line === '') {
      // A single word wider than the line is cut by characters.
      if (line === '' && measure(word) > maxWidth) {
        let chunk = '';
        for (const ch of Array.from(word)) {
          if (measure(chunk + ch) > maxWidth && chunk) {
            lines.push(chunk);
            chunk = '';
          }
          chunk += ch;
        }
        line = chunk;
      } else {
        line = next;
      }
    } else {
      lines.push(line.trimEnd());
      line = word.trimStart();
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

function segmentWords(text: string): string[] {
  const out: string[] = [];
  const parts = text.replace(/\r\n?/g, '\n').split('\n');
  parts.forEach((part, i) => {
    if (i > 0) out.push('\n');
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      const seg = new Intl.Segmenter('th', { granularity: 'word' });
      for (const s of seg.segment(part)) out.push(s.segment);
    } else {
      out.push(...Array.from(part));
    }
  });
  return out;
}

function splitGraphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    return Array.from(new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

/** Thai date with the Buddhist year, e.g. "24 พฤศจิกายน 2569". */
export function thaiDate(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image_failed ${src}`));
    img.src = src;
  });
}

async function ensureFonts() {
  if (!document.fonts) return;
  await Promise.all([
    document.fonts.load(`600 64px ${FONT}`, 'ลอยกระทง'),
    document.fonts.load(`400 32px ${FONT}`, 'ลอยกระทง'),
  ]).catch(() => {});
}

/** Draws the krathong sprites onto their own canvas, so it can be placed and mirrored. */
async function krathongCanvas(krathong: Krathong, width: number): Promise<HTMLCanvasElement> {
  const height = Math.round((width * 190) / 220);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  const layers = spriteLayers(krathong.design);
  // Draw whatever loaded: one missing garnish should not leave the card without a krathong.
  const images = await Promise.allSettled(layers.map((l) => loadImage(l.src)));
  if (images[0]?.status !== 'fulfilled') throw new Error('base_failed');
  const lift = (liftPercent(krathong.design.base) / 100) * height;
  layers.forEach((layer, i) => {
    const r = images[i];
    if (r?.status === 'fulfilled') ctx.drawImage(r.value, 0, layer.lift ? -lift : 0, width, height);
  });
  return c;
}

export async function renderMemoryCard({ krathong, river, placeTitle, host }: MemoryCardInput): Promise<Blob> {
  await ensureFonts();
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = `rgb(${NIGHT})`;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Backdrop: fill the card's height with the middle of the scene, horizon raised to 40%.
  const horizon = Math.round(CARD_H * 0.4);
  try {
    const scene = await loadImage(`/scenes/${river.id}.webp`);
    // 0.85 keeps the tallest landmark (Wat Arun's prang) inside the 4:5 frame.
    const scale = (CARD_H * 0.85) / scene.height;
    const w = scene.width * scale;
    const h = scene.height * scale;
    ctx.drawImage(scene, (CARD_W - w) / 2, horizon - h / 2, w, h);
  } catch {
    // The night colour alone still makes a usable card.
  }

  // Text, measured first so the krathong can take the space that is left.
  const measureAt = (size: number, weight = 400) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    return (s: string) => ctx.measureText(s).width;
  };
  const textWidth = CARD_W - SIDE * 2;

  // The person's name heads the card; krathongs no longer carry a name of their own.
  const name = krathong.displayName;
  let nameSize = 64;
  while (nameSize > 40 && measureAt(nameSize, 600)(name) > textWidth) nameSize -= 4;
  const nameLines = wrapText(name, textWidth, measureAt(nameSize, 600)).slice(0, 2);

  const wish = krathong.publicWish?.trim() || null;
  let wishSize = 34;
  let wishLines: string[] = [];
  if (wish) {
    const maxLines = (size: number) => (size >= 34 ? 4 : size >= 30 ? 6 : 9);
    for (;;) {
      wishLines = wrapText(`“${wish}”`, textWidth, measureAt(wishSize));
      if (wishLines.length <= maxLines(wishSize) || wishSize <= 24) break;
      wishSize -= 2;
    }
  }

  const footerY = CARD_H - 64;
  const nameLine = nameSize * 1.3;
  const wishLine = wishSize * 1.55;
  const byGap = 12;
  const blockHeight = nameLines.length * nameLine + byGap + (wishLines.length ? 36 + wishLines.length * wishLine : 0);
  const blockBottom = footerY - 110;
  const blockTop = blockBottom - blockHeight;

  // Krathong sits on the water, as big as the text allows.
  const artBottom = blockTop - 8;
  // The plate may rise a little above the far edge of the water, as it does in the river view.
  const maxArtH = Math.min(560, artBottom - (horizon - 70));
  const artW = Math.max(260, Math.round((maxArtH * 220) / 190));
  const art = await krathongCanvas(krathong, artW).catch(() => null);
  if (art) {
    const x = (CARD_W - art.width) / 2;
    const y = artBottom - art.height;
    // reflection
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.translate(0, y + art.height * 2 - art.height * 0.18);
    ctx.scale(1, -1);
    ctx.drawImage(art, x, 0);
    ctx.restore();
    if (krathong.design.candle) {
      const lift = (liftPercent(krathong.design.base) / 100) * art.height;
      const gx = CARD_W / 2;
      const gy = y + art.height * 0.21 - lift;
      const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, art.width * 0.32);
      glow.addColorStop(0, 'rgba(255, 210, 130, 0.5)');
      glow.addColorStop(0.45, 'rgba(245, 199, 106, 0.12)');
      glow.addColorStop(1, 'rgba(245, 199, 106, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(gx - art.width, gy - art.width, art.width * 2, art.width * 2);
    }
    ctx.drawImage(art, x, y);
  }

  // Shade under the text so it reads on any backdrop.
  const shadeTop = Math.max(horizon + 40, blockTop - 120);
  const shade = ctx.createLinearGradient(0, shadeTop, 0, CARD_H);
  shade.addColorStop(0, `rgba(${NIGHT}, 0)`);
  shade.addColorStop(0.35, `rgba(${NIGHT}, 0.78)`);
  shade.addColorStop(1, `rgba(${NIGHT}, 0.96)`);
  ctx.fillStyle = shade;
  ctx.fillRect(0, shadeTop, CARD_W, CARD_H - shadeTop);
  const topShade = ctx.createLinearGradient(0, 0, 0, 180);
  topShade.addColorStop(0, `rgba(${NIGHT}, 0.7)`);
  topShade.addColorStop(1, `rgba(${NIGHT}, 0)`);
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, CARD_W, 180);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let y = blockTop;
  ctx.fillStyle = INK;
  ctx.font = `600 ${nameSize}px ${FONT}`;
  for (const line of nameLines) {
    y += nameLine;
    ctx.fillText(line, CARD_W / 2, y - nameLine * 0.22);
  }
  y += byGap;
  if (wishLines.length) {
    y += 36;
    ctx.fillStyle = INK;
    ctx.font = `400 ${wishSize}px ${FONT}`;
    for (const line of wishLines) {
      y += wishLine;
      ctx.fillText(line, CARD_W / 2, y - wishLine * 0.3);
    }
  }

  // Brand top left, place and date bottom left, address bottom right.
  ctx.textAlign = 'left';
  ctx.fillStyle = GOLD;
  ctx.font = `600 40px ${FONT}`;
  ctx.fillText('ลอยนำกันเด้อ', SIDE, 104);

  ctx.strokeStyle = 'rgba(245, 199, 106, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(SIDE, footerY - 76);
  ctx.lineTo(CARD_W - SIDE, footerY - 76);
  ctx.stroke();

  // Long room titles shrink first, then lose whole graphemes (never half a Thai syllable).
  const place = placeTitle || river.name;
  let placeSize = 30;
  while (placeSize > 22 && measureAt(placeSize, 600)(place) > CARD_W * 0.6) placeSize -= 2;
  const placeFit = measureAt(placeSize, 600);
  let placeText = place;
  if (placeFit(placeText) > CARD_W * 0.6) {
    const graphemes = splitGraphemes(place);
    while (graphemes.length > 4 && placeFit(graphemes.join('')) > CARD_W * 0.6) graphemes.pop();
    placeText = graphemes.join('');
  }
  ctx.fillStyle = INK;
  ctx.font = `600 ${placeSize}px ${FONT}`;
  ctx.fillText(placeText.trim(), SIDE, footerY - 30);
  ctx.fillStyle = MIST;
  ctx.font = `400 26px ${FONT}`;
  ctx.fillText(thaiDate(krathong.floatedAt), SIDE, footerY + 6);
  ctx.textAlign = 'right';
  ctx.fillStyle = GOLD;
  ctx.font = `400 26px ${FONT}`;
  ctx.fillText(host, CARD_W - SIDE, footerY + 6);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('card_failed'))), 'image/jpeg', 0.9),
  );
}
