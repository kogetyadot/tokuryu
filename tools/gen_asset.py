# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "google-genai>=2.28.0",
#   "pillow>=10.0.0",
# ]
# ///
"""Game asset generator using Gemini API (Nano Banana 2.1, Lyria 3.5, Gemini Omni 1.2 Flash)."""

import argparse
import base64
import os
import subprocess
import sys
from pathlib import Path

from google import genai


def load_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if key:
        return key.strip()
    key_file = Path.home() / ".gemini" / "gemini_api_key"
    if key_file.exists():
        return key_file.read_text(encoding="utf-8").strip()
    print(
        "Error: GEMINI_API_KEY is not set and ~/.gemini/gemini_api_key was not found.",
        file=sys.stderr,
    )
    sys.exit(1)


def _decode_bytes(data) -> bytes:
    if isinstance(data, bytes):
        return data
    if isinstance(data, str):
        return base64.b64decode(data)
    raise TypeError(f"Unsupported binary payload type: {type(data)}")


def _extract_media_bytes(obj, media_type: str) -> bytes | None:
    attr_map = {
        "image": "output_image",
        "audio": "output_audio",
        "video": "output_video",
    }
    attr = attr_map.get(media_type)
    if attr and hasattr(obj, attr):
        val = getattr(obj, attr)
        if val is not None and getattr(val, "data", None):
            return _decode_bytes(val.data)

    for seq_attr in ("outputs", "steps"):
        items = getattr(obj, seq_attr, None) or []
        for item in items:
            item_type = str(getattr(item, "type", "")).lower()
            if media_type in item_type and getattr(item, "data", None):
                return _decode_bytes(item.data)
            nested = getattr(item, "content", None) or getattr(item, "outputs", None) or []
            if isinstance(nested, list):
                for sub in nested:
                    sub_type = str(getattr(sub, "type", "")).lower()
                    if media_type in sub_type and getattr(sub, "data", None):
                        return _decode_bytes(sub.data)
                    inline = getattr(sub, "inline_data", None)
                    if inline and media_type in str(getattr(inline, "mime_type", "")).lower() and getattr(inline, "data", None):
                        return _decode_bytes(inline.data)

    candidates = getattr(obj, "candidates", None) or []
    for cand in candidates:
        content = getattr(cand, "content", None)
        parts = getattr(content, "parts", None) or []
        for part in parts:
            inline = getattr(part, "inline_data", None)
            if inline and media_type in str(getattr(inline, "mime_type", "")).lower() and getattr(inline, "data", None):
                return _decode_bytes(inline.data)

    return None


def _build_interaction_input(prompt: str, refs: list[str] | None):
    if not refs:
        return prompt
    contents: list = [{"type": "text", "text": prompt}]
    for ref_path in refs:
        p = Path(ref_path)
        mime = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
        b64 = base64.b64encode(p.read_bytes()).decode("utf-8")
        contents.append({"type": "image", "data": b64, "mime_type": mime})
    return contents


def _build_gc_contents(prompt: str, refs: list[str] | None):
    if not refs:
        return prompt
    from google.genai import types
    parts = [types.Part.from_text(text=prompt)]
    for ref_path in refs:
        p = Path(ref_path)
        mime = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
        parts.append(types.Part.from_bytes(data=p.read_bytes(), mime_type=mime))
    return [types.Content(role="user", parts=parts)]


def generate_music(client: genai.Client, args: argparse.Namespace) -> None:
    model = args.model or "lyria-3.5"
    raw = None
    try:
        interaction = client.interactions.create(model=model, input=args.prompt)
        raw = _extract_media_bytes(interaction, "audio")
    except Exception as e:
        print(f"Interactions API fallback ({e}); trying generate_content...", file=sys.stderr)
        resp = client.models.generate_content(model=model, contents=args.prompt)
        raw = _extract_media_bytes(resp, "audio")

    if not raw:
        raise RuntimeError(f"No audio returned from {model}")

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(raw)
    print(f"Saved music to {out} ({out.stat().st_size} bytes)")


def generate_image(client: genai.Client, args: argparse.Namespace) -> None:
    model = args.model or "gemini-nano-banana-2.1"
    raw = None
    try:
        interaction = client.interactions.create(
            model=model, input=_build_interaction_input(args.prompt, args.ref)
        )
        raw = _extract_media_bytes(interaction, "image")
    except Exception as e:
        print(f"Interactions API fallback ({e}); trying generate_content...", file=sys.stderr)
        resp = client.models.generate_content(
            model=model, contents=_build_gc_contents(args.prompt, args.ref)
        )
        raw = _extract_media_bytes(resp, "image")

    if not raw:
        raise RuntimeError(f"No image returned from {model}")

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(raw)

    if args.resize:
        from PIL import Image
        w, h = map(int, args.resize.lower().split("x"))
        with Image.open(out) as img:
            img.resize((w, h), Image.Resampling.LANCZOS).save(out)
    print(f"Saved image to {out} ({out.stat().st_size} bytes)")


def generate_video(client: genai.Client, args: argparse.Namespace) -> None:
    model = args.model or "gemini-omni-1.2-flash"
    raw = None
    last_err = None
    try:
        interaction = client.interactions.create(
            model=model, input=_build_interaction_input(args.prompt, args.ref)
        )
        raw = _extract_media_bytes(interaction, "video")
        if not raw:
            print("Interactions returned no video payload; trying generate_content...", file=sys.stderr)
    except Exception as e:
        last_err = e
        print(f"Interactions API fallback ({e}); trying generate_content...", file=sys.stderr)

    if not raw:
        try:
            resp = client.models.generate_content(
                model=model, contents=_build_gc_contents(args.prompt, args.ref)
            )
            raw = _extract_media_bytes(resp, "video")
        except Exception as e:
            raise RuntimeError(f"Video generation failed ({last_err} / {e})") from e

    if not raw:
        raise RuntimeError(f"No video returned from {model}")

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(raw)
    print(f"Saved video to {out} ({out.stat().st_size} bytes)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate game assets via Gemini API")
    sub = parser.add_subparsers(dest="kind", required=True)

    for kind in ("image", "music", "video"):
        p = sub.add_parser(kind)
        p.add_argument("--prompt", required=True, help="Generation prompt")
        p.add_argument("--output", required=True, help="Output file path")
        p.add_argument("--model", default=None, help="Override Gemini model ID")
        if kind in ("image", "video"):
            p.add_argument("--ref", nargs="*", help="Optional reference image paths")
        if kind == "image":
            p.add_argument("--resize", help="Optional WxH resize (e.g. 64x64)")

    args = parser.parse_args()
    client = genai.Client(api_key=load_api_key(), http_options={"api_version": "v1beta"})

    if args.kind == "image":
        generate_image(client, args)
    elif args.kind == "music":
        generate_music(client, args)
    elif args.kind == "video":
        generate_video(client, args)


if __name__ == "__main__":
    main()
