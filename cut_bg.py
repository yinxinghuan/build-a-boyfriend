#!/usr/bin/env python3
"""Turn the flat-grey sticker bust shots into clean HEAD-ONLY die-cut stickers.

The image model won't reliably honour "no shoulders" — it keeps drawing a bust with
a collar/shirt. So we fix it deterministically instead of fighting the prompt:

  1. color-key the flat grey background (flood-fill from the 4 corners). Because the
     model draws a closed white border, ~bg is already a SOLID, hole-free silhouette
     of the whole bust (interior gaps aren't connected to the outside).
  2. find the NECK = the narrowest row below the head; if the silhouette re-widens
     below it (shoulders/shirt), crop everything below the neck.
  3. crop to the head bbox, keep the original art pixels, and grow a uniform white
     sticker border around the cut (covers the flat neck edge so it reads as a head).
  4. recenter into a transparent square so the engine's drawImage stays centered.

Re-runnable: pristine originals are stashed in public/tiers/_raw/.
"""
import glob, os, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

KEY = (255, 0, 255)   # magenta sentinel — won't occur in the flat cartoon art
BG_THRESH = 50        # color distance for "this is background"
BORDER_FRAC = 0.05    # white border thickness, fraction of the head's longer side
PAD = 0.08            # square padding around the head, fraction of the longer side


def silhouette(rgb: Image.Image) -> np.ndarray:
    """Flood-fill the grey bg from the 4 corners; ~bg = solid bust silhouette."""
    work = rgb.copy()
    w, h = work.size
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(work, seed, KEY, thresh=BG_THRESH)
    bg = np.all(np.array(work) == KEY, axis=-1)
    return ~bg


def find_neck(widths: np.ndarray) -> int | None:
    """Neck = the pinch just above a shoulder bulge near the bottom of the bust.

    Shoulders are often as wide as / wider than the head, so we anchor on the
    shoulder bulge in the bottom third, then find the narrowest row between it and
    mid-head. A lower clamp protects the chin from being cut. Only fires when the
    pinch is clearly narrower than both the head and the shoulders.
    """
    nz = np.where(widths > 0)[0]
    if len(nz) == 0:
        return None
    top, bot = nz[0], nz[-1]
    span = bot - top
    if span < 60:
        return None
    head_max = widths[top:top + int(0.6 * span) + 1].max()
    b0 = top + int(0.68 * span)              # shoulder bulge lives in the bottom third
    if b0 >= bot:
        return None
    sh_row = b0 + int(np.argmax(widths[b0:bot + 1]))
    sh_w = widths[sh_row]
    min_row = top + int(0.52 * span)         # never cut above mid-head (protect the chin)
    if sh_row <= min_row:
        return None
    seg = widths[min_row:sh_row + 1]
    neck_w = int(seg.min())
    if not (sh_w > 0 and neck_w < 0.82 * sh_w and neck_w < 0.82 * head_max):
        return None
    # Cut at the LOWEST still-narrow row (bottom of the neck, just before the
    # shoulders flare) rather than the single narrowest — the narrowest can land on
    # the jaw/chin taper and clip the chin. Keeping a tiny neck stub is fine: the
    # white sticker border wraps it so it still reads as a clean head.
    band = np.where(seg <= neck_w * 1.18)[0]
    cut = min_row + int(band[-1])
    # Chin guard: if the cut still lands on a wide row (≈ jaw/chin, not a thin
    # neck — e.g. an open-mouth face whose chin sits right on the shoulders), the
    # head has no real neck. Slide the cut DOWN to just before the shoulders truly
    # flare so the whole chin survives — a sliver of shoulder under the border
    # reads better than a sheared-off jaw.
    if widths[cut] > 0.70 * head_max:
        flare = np.where(widths[cut:sh_row + 1] > 1.05 * head_max)[0]
        if len(flare):
            cut = cut + int(flare[0])
    return cut


def extent(sil: np.ndarray) -> np.ndarray:
    """Per-row body width = rightmost-leftmost filled pixel (the true silhouette
    outline, not a pixel count — a solid shirt and a hollow head read the same)."""
    out = np.zeros(sil.shape[0], dtype=int)
    for i, row in enumerate(sil):
        xs = np.where(row)[0]
        if len(xs):
            out[i] = xs[-1] - xs[0] + 1
    return out


def crop_neck(sil: np.ndarray) -> np.ndarray:
    """Crop the silhouette below the neck (detected on the filled-silhouette width)."""
    neck = find_neck(extent(sil))
    if neck is not None:
        sil = sil.copy()
        sil[neck:, :] = False
    return sil


def cut(path: str) -> None:
    rgb = Image.open(path).convert("RGB")
    arr = np.array(rgb)

    fg = silhouette(rgb)
    sil = crop_neck(fg)
    ys, xs = np.where(sil)
    if len(xs) == 0:
        print("  (empty mask)", path); return
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    s = sil[y0:y1 + 1, x0:x1 + 1]
    rc = arr[y0:y1 + 1, x0:x1 + 1]
    hc, wc = s.shape

    border = max(4, int(max(hc, wc) * BORDER_FRAC))
    grown = np.array(
        Image.fromarray((s * 255).astype("uint8"))
        .filter(ImageFilter.GaussianBlur(border))
        .point(lambda p: 255 if p >= 40 else 0)
    ) > 0

    out = np.zeros((hc, wc, 4), dtype="uint8")
    out[grown] = (255, 255, 255, 255)   # white sticker border (covers the neck cut)
    out[s, 0:3] = rc[s]                  # original head art on top
    out[s, 3] = 255
    stick = Image.fromarray(out, "RGBA")

    side = int(max(stick.width, stick.height) * (1 + PAD * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(stick, ((side - stick.width) // 2, (side - stick.height) // 2), stick)
    canvas.save(path)
    print(f"  cut {os.path.basename(path)} -> {side}x{side}")


def main():
    raw = "public/tiers/_raw"
    os.makedirs(raw, exist_ok=True)
    for p in sorted(glob.glob("public/tiers/tier*.png")):
        bak = os.path.join(raw, os.path.basename(p))
        if not os.path.exists(bak):
            shutil.copy(p, bak)
        else:
            shutil.copy(bak, p)  # re-cut from the pristine raw
        cut(p)
    print("done")


if __name__ == "__main__":
    main()
