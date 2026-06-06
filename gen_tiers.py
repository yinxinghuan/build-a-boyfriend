#!/usr/bin/env python3
"""Generate the 11-tier 渣男 chibi art for Build-a-Boyfriend.
txt2img via the aigram transit gen-image endpoint. Run from this folder.
Each tier shares a style preamble so the ladder reads as one art set, but the
archetype/props change so every merge pops a recognizably worse boyfriend."""
import json, os, ssl, subprocess, sys, time, urllib.request, urllib.error

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE

# Transit endpoint: flat {prompt, ref_url?}, no user_id, no {query,params} wrapper.
# REQUIRED from non-browser clients: Origin must be aigram.app or you get 403.
# (Old aiservice.wdabuliu.com:8019/genl_image is permanently dead as of 2026-06-06.)
API_URL = "https://chat.aiwaves.tech/aigram/api/gen-image"
HEADERS = {
    "Content-Type": "application/json",
    "Origin": "https://aigram.app",
    "Referer": "https://aigram.app/",
    "User-Agent": "Mozilla/5.0",
}
TIMEOUT = int(os.environ.get("GEN_TIMEOUT", "360"))
OUT_DIR = os.path.join(os.path.dirname(__file__), "public", "tiers")

STYLE = ("chibi cartoon boyfriend mascot, one single character, huge round head small body, "
         "centered portrait, FULL BLEED square composition filling the entire frame edge to edge, "
         "no border no frame no padding, soft painterly cel shading, thick clean dark outlines, "
         "glossy highlights, vibrant deep magenta hot-pink and purple background gradient, "
         "cute mobile merge-game character art, expressive comedic face, no text, no watermark")

TIERS = [
    "a tiny meek shy young man holding a phone showing a glowing heart like-button, "
    "timid half-smile, barely-there boyfriend, very small and unassuming",

    "a young man in a dark hoodie lit blue by his phone screen in the dark, droopy half-lidded "
    "sleepy eyes, sly late-night smirk, typing a 3am text",

    "a beefy gym bro in a tight tank top holding a protein shaker bottle, flexing one bicep, "
    "salesman grin, sweatband, pushing his coaching plan",

    "a hopeful sad-puppy-eyed young man sitting waiting on a bench holding a slightly wilting "
    "bouquet of flowers, second-choice backup boyfriend, gentle pathetic smile",

    "a noncommittal young man giving an ambiguous shrug, one eyebrow raised, half turned away, "
    "a floating question mark over his head, undefined situationship vibe",

    "a young man's face shown inside a glowing webcam video-call window with little heart "
    "emojis floating, pixelated screen glow, long-distance online boyfriend, never met in person",

    "a clean-cut confident young man in a casual couple outfit holding a coffee cup, "
    "warm proud official-boyfriend smile, tidy hair, wholesome",

    "a lazy slob roommate slouched on a couch in a stained tank top, game controller in hand, "
    "messy socks and clutter around him, unbothered grin",

    "a smug young man kneeling on one knee holding open a ring box, a credit card peeking from "
    "the box, slick overconfident grin, cheap engagement",

    "a comfortable middle-aged husband with a round belly in an open bathrobe and socks, "
    "TV remote in hand, wedding ring, contented oblivious slob smile",

    "a giant absurd man-baby: a grown man's smug face wearing a baby bonnet and pacifier and "
    "diaper, oversized chubby body, final-boss colossal man-baby, pink, throwing a tantrum",
]


def call(prompt, retries=3):
    payload = json.dumps({"prompt": prompt}).encode()
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(API_URL, data=payload, headers=HEADERS, method="POST")
            with urllib.request.urlopen(req, timeout=TIMEOUT, context=_SSL) as r:
                body = json.loads(r.read())
            url = body.get("url")
            if not url:
                raise RuntimeError(f"no url in response: {body}")
            return url
        except urllib.error.HTTPError as e:
            try:
                msg = e.read().decode("utf-8", "replace")[:200]
            except Exception:
                msg = ""
            last = RuntimeError(f"HTTP {e.code}: {msg}")
            print(f"  retry {attempt+1}/{retries} after HTTP {e.code}")
        except Exception as e:
            last = e
            print(f"  retry {attempt+1}/{retries} after {e}")
        time.sleep(8 * (attempt + 1))
    print(f"  FAILED: {last}")
    return None


def download(url, out):
    src = os.path.splitext(url.split("?")[0])[1].lower() or ".png"
    tmp = out + src
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60, context=_SSL) as r:
        data = r.read()
    with open(tmp, "wb") as f:
        f.write(data)
    if src != ".png":
        subprocess.run(["sips", "-s", "format", "png", tmp, "--out", out], check=True, capture_output=True)
        os.remove(tmp)
    else:
        os.rename(tmp, out)
    print(f"  saved {out} ({os.path.getsize(out)//1024} KB)")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    only = [int(a) for a in sys.argv[1:]] if len(sys.argv) > 1 else list(range(len(TIERS)))
    for i in only:
        out = os.path.join(OUT_DIR, f"tier{i}.png")
        if os.path.isfile(out) and os.path.getsize(out) > 1024:
            print(f"[tier{i}] already exists, skip"); continue
        prompt = f"{TIERS[i]}, {STYLE}"
        print(f"\n[tier{i}] {TIERS[i][:60]}...")
        url = call(prompt)
        if not url:
            print(f"  FAILED tier{i}"); continue
        print(f"  -> {url}")
        download(url, out)
        time.sleep(3)
    print("\ndone")


if __name__ == "__main__":
    main()
