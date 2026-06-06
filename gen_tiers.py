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

# Bold-outline flat sticker HEADS on a flat background — these get color-keyed into
# floating head cutouts + a white die-cut border in post, so the art must be HEAD ONLY
# (no neck, no shoulders, no body) with a thick clean outline. Archetype must read from
# the FACE / hair / head-level accessory. Head fills the frame, centered.
STYLE = ("a single die-cut STICKER of ONE man's HEAD, bold thick clean black ink outline, flat "
         "cel-shaded solid color fills, simple chunky cartoon shapes, playful comedic caricature, "
         "a clean white sticker border hugging the silhouette. "
         "CRITICAL: draw ONLY the head and hair — the sticker silhouette follows the outline of "
         "the HEAD AND HAIR and ENDS AT THE JAW AND CHIN, like a single emoji head. "
         "NO neck, NO neck stub, NO shoulders, NO shirt, NO collar, NO chest, NO body of any kind. "
         "Big expressive head, facing camera, exaggerated comedic facial expression, head "
         "centered, FLAT SOLID UNIFORM MEDIUM GREY background, no gradient, no texture, no "
         "scenery, no drop shadow, no text, no watermark, no logo")

TIERS = [
    # 0 点赞之交 — likes-only acquaintance
    "a meek forgettable plain everyman face, shy awkward closed-lip half-smile, hopeful "
    "nervous wide eyes, soft unremarkable boy-next-door features, totally harmless and timid",

    # 1 半夜「在吗」 — 3am 'u up?'
    "a scruffy young man with light stubble and messy bed hair, heavy half-lidded sleepy "
    "bedroom eyes, sly knowing late-night smirk, one eyebrow cocked, face faintly lit cold "
    "blue from below by an off-screen phone glow",

    # 2 健身房推销男 — gym salesman bro
    "a smug overtanned gym-bro face wearing a sporty terry headband, cocky open-mouth "
    "salesman grin showing too-white teeth, veiny temple, raised eyebrows, vain and way too "
    "pleased with himself",

    # 3 备胎 — the backup / spare
    "a hopeful sad puppy-dog-eyed young man, big pleading watery eyes, eager 'pick me' "
    "lopsided half-smile, slightly slumped, soft eager-to-please pathetic expression",

    # 4 暧昧对象 — situationship
    "a noncommittal smirking young man, one eyebrow raised, evasive sideways side-eye glance, "
    "sly 'we're not labeling it' lopsided smirk, head slightly tilted away, a small floating "
    "question mark beside his head",

    # 5 网恋男友 — online-only boyfriend
    "a young man's head with faint pixelated digital screen-glow grain on his skin and a couple "
    "of glitchy horizontal scanline artifacts across his face, puckered lips blowing an "
    "exaggerated kiss at the camera, a small floating red webcam REC dot beside his head, "
    "never-met-in-person online boyfriend",

    # 6 正牌男友 — the actual official boyfriend
    "a clean-cut genuinely handsome confident young man, warm proud sincere wholesome smile, "
    "tidy neatly groomed hair, clear bright trustworthy eyes, the rare decent good one",

    # 7 同居室友 — live-in slob roommate
    "an unshaven lazy slob with greasy unkempt messy bed hair and a faint double chin, "
    "dead-eyed unbothered lazy half-grin, slack checked-out expression, never-does-the-dishes "
    "roommate energy",

    # 8 未婚夫 — the fiance
    "a slick overconfident young man with shiny gelled-back hair, smug salesman wink, oily "
    "too-pleased self-satisfied grin, raised cocky eyebrow, bargain-bin charm",

    # 9 老公 — the husband
    "a comfortable balding middle-aged husband with a round face, stubbled double chin, "
    "receding hairline, contented oblivious checked-out droopy-eyed smile, completely let "
    "himself go",

    # 10 巨婴老公 — the man-baby final boss
    "an absurd grown man with a fully adult stubbled face wearing a frilly white baby bonnet "
    "and sucking an oversized blue pacifier in his mouth, chubby cheeks puffed up, furious "
    "scrunched-up crying tantrum eyes, ridiculous colossal final-boss man-baby meltdown",
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
