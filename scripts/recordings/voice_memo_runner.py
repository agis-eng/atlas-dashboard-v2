#!/usr/bin/env python3
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path

from shared import (
    DEFAULT_STORE_PATH,
    DEFAULT_VOICE_ENV_PATH,
    compute_dedupe_key,
    load_json,
    load_match_context,
    load_runtime_config,
    match_recording,
    now_iso,
    slugify,
    upsert_recording,
    write_json,
)


SUPPORTED_SUFFIXES = {".m4a", ".mp3", ".wav", ".mp4", ".aac", ".txt", ".md"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Idempotent local voice memo ingestion runner."
    )
    parser.add_argument("--config", default=str(DEFAULT_VOICE_ENV_PATH))
    parser.add_argument("--store", default=str(DEFAULT_STORE_PATH))
    parser.add_argument("--state", default="")
    parser.add_argument("--source-dir", default="")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    return parser.parse_args()


def detect_source_dir(cli_source_dir: str, config: dict[str, str]) -> Path:
    configured = cli_source_dir or config.get("VOICE_MEMO_SOURCE_DIR", "")
    if not configured:
        raise SystemExit(
            "VOICE_MEMO_SOURCE_DIR is required. Set it in .config/recordings/voice-memos.env, "
            "via VOICE_MEMO_CONFIG_FILE, or pass --source-dir."
        )
    return Path(configured).expanduser()


def detect_state_path(args: argparse.Namespace, source_dir: Path) -> Path:
    if args.state:
        return Path(args.state).expanduser()
    return source_dir / ".voice_memo_ingestion_state.json"


def collect_files(source_dir: Path) -> list[Path]:
    candidates = [
        path
        for path in source_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES
    ]
    return sorted(candidates)


def build_recording(path: Path, source_dir: Path, match_context: dict, run_id: str) -> dict:
    source_id = path.relative_to(source_dir).as_posix()
    occurred_at = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    transcript = None
    summary = ""
    if path.suffix.lower() in {".txt", ".md"}:
        transcript = path.read_text(encoding="utf-8", errors="ignore").strip()
        summary = transcript.splitlines()[0][:280] if transcript else ""

    match = match_recording(summary_text=summary or transcript or "", title=path.stem, match_context=match_context)
    return {
        "id": f"voice-memo:{slugify(source_id)}",
        "source": "voice_memo",
        "kind": "voice_memo",
        "sourceId": source_id,
        "dedupeKey": compute_dedupe_key("voice_memo", source_id),
        "title": path.stem.replace("_", " ").replace("-", " ").strip().title(),
        "occurredAt": occurred_at,
        "recordedOn": occurred_at[:10],
        "participants": ["Unknown"],
        "project": {
            "suggested": {
                "id": match.project.entity_id,
                "label": match.project.entity_name,
                "confidence": match.project.confidence,
                "reason": match.project.reason,
            },
            "manual": {"id": None, "label": None},
        },
        "partner": {
            "suggested": {
                "id": match.partner.entity_id,
                "label": match.partner.entity_name,
                "confidence": match.partner.confidence,
                "reason": match.partner.reason,
            },
            "manual": {"id": None, "label": None},
        },
        "brain": {
            "suggested": {
                "id": match.brain.entity_id,
                "label": match.brain.entity_name,
                "confidence": match.brain.confidence,
                "reason": match.brain.reason,
            },
            "manual": {"id": None, "label": None},
        },
        "review": {
            "status": "needs_review",
            "notes": "",
            "assignedBy": None,
            "assignedAt": None,
        },
        "content": {
            "summary": summary,
            "keyPoints": [],
            "actionItems": [],
            "transcript": transcript,
        },
        "links": {
            "sourceUrl": None,
            "shareUrl": None,
            "notionUrl": None,
            "audioPath": str(path),
        },
        "metadata": {
            "importedFrom": "local_voice_memo_runner",
            "matchedBy": match.project.matched_by or match.partner.matched_by,
            "legacyProjectMatch": None,
            "ingestion": {
                "importedAt": now_iso(),
                "updatedAt": now_iso(),
                "runId": run_id,
            },
            "manualFields": {
                "projectRequired": match.project.entity_id is None,
                "partnerRequired": match.partner.entity_id is None,
                "brainRequired": match.brain.entity_id is None,
            },
        },
    }


def main() -> None:
    args = parse_args()
    config = load_runtime_config(Path(args.config).expanduser())
    source_dir = detect_source_dir(args.source_dir, config)
    state_path = detect_state_path(args, source_dir)
    store_path = Path(args.store).expanduser()
    match_context = load_match_context()
    state = load_json(state_path, {"processed": {}})
    store = load_json(store_path, {"version": 1, "updatedAt": now_iso(), "recordings": []})
    run_id = f"voice-memo-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"

    files = collect_files(source_dir)
    if args.limit > 0:
        files = files[: args.limit]

    created = 0
    updated = 0
    skipped = 0

    for path in files:
        fingerprint = f"{int(path.stat().st_mtime)}:{path.stat().st_size}"
        if state["processed"].get(str(path)) == fingerprint:
            skipped += 1
            continue

        recording = build_recording(path, source_dir, match_context, run_id)
        store, action = upsert_recording(store, recording)
        if action == "created":
            created += 1
        else:
            updated += 1
        state["processed"][str(path)] = fingerprint

    store["recordings"] = sorted(
        store.get("recordings", []),
        key=lambda item: item.get("occurredAt", ""),
        reverse=True,
    )
    store["updatedAt"] = now_iso()

    print(
        f"voice memo runner dry_run={not args.apply} source_dir={source_dir} created={created} updated={updated} skipped={skipped}"
    )

    if args.apply:
        write_json(store_path, store)
        write_json(state_path, state)
        print(f"wrote store={store_path} state={state_path}")
    else:
        print("dry run only; pass --apply to persist recordings and state")


if __name__ == "__main__":
    main()
