"""Prepare the explicitly CC0 audio assets. Requires local ffmpeg; no runtime SDK."""
from pathlib import Path
import hashlib
import json
import subprocess
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "test-results" / "audio-source"
OUTPUT = ROOT / "public" / "assets" / "audio"
CACHE.mkdir(parents=True, exist_ok=True)
OUTPUT.mkdir(parents=True, exist_ok=True)

def download(name, url):
    target = CACHE / name
    if not target.exists():
        with urllib.request.urlopen(url, timeout=60) as source:
            target.write_bytes(source.read())
    return target

def encode(source, name, filters, *options):
    target = OUTPUT / name
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
                    "-map_metadata", "-1", "-vn", "-af", filters, *options, str(target)], check=True)
    return {"file": name, "bytes": target.stat().st_size,
            "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest()}

result = []
for filename, url, output in [
    ("forget-me-not.ogg", "https://opengameart.org/sites/default/files/forget_me_not_in_f_major_looped.ogg", "forget-me-not.mp3"),
    ("a-simple-trifle.ogg", "https://opengameart.org/sites/default/files/ASimpleTrifle_0.ogg", "a-simple-trifle.mp3"),
]:
    source = download(filename, url)
    result.append(encode(source, output, "loudnorm=I=-22:TP=-5:LRA=9", "-ac", "1", "-ar", "32000", "-c:a", "libmp3lame", "-b:a", "80k"))

archive = download("interface-sounds.zip", "https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip")
with zipfile.ZipFile(archive) as package:
    license_dir = ROOT / "docs" / "licenses"
    license_dir.mkdir(parents=True, exist_ok=True)
    license_text = package.read("License.txt").decode("utf-8-sig")
    normalized_license = "\n".join(line.rstrip() for line in license_text.splitlines()).strip() + "\n"
    (license_dir / "kenney-interface-sounds.txt").write_text(normalized_license, encoding="utf-8", newline="\n")
    for source_name, output in {
        "click_001": "tap", "scroll_001": "paper", "open_001": "open",
        "close_001": "close", "maximize_001": "send", "confirmation_001": "success",
        "drop_002": "feed",
    }.items():
        source = CACHE / (source_name + ".ogg")
        source.write_bytes(package.read("Audio/" + source.name))
        result.append(encode(source, output + ".wav", "highpass=f=100,lowpass=f=4500,loudnorm=I=-24:TP=-7:LRA=7,afade=t=in:d=0.008,areverse,afade=t=in:d=0.015,areverse", "-ac", "1", "-ar", "22050", "-c:a", "pcm_s16le"))
# The source contains two soft calls; keep only the first, with quiet edges.
source = download("cat_softmew.wav", "https://opengameart.org/sites/default/files/cat_softmew.wav")
result.append(encode(source, "meow.wav", "atrim=start=0.28:end=1.28,asetpts=PTS-STARTPTS,highpass=f=180,lowpass=f=6500,loudnorm=I=-25:TP=-8:LRA=7,afade=t=in:d=0.015,areverse,afade=t=in:d=0.04,areverse", "-ac", "1", "-ar", "22050", "-c:a", "pcm_s16le"))
print(json.dumps(result, indent=2))
