#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from shared import (
    DEFAULT_FATHOM_ENV_PATH,
    DEFAULT_STORE_PATH,
    compute_dedupe_key,
    load_json,
    load_match_context,
    load_runtime_config,
    match_recording,
    now_iso,
    upsert_recording,
    write_json,
)


DEFAULT_API_BASE = "https://api.fathom.ai/external/v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync recent Fathom meetings into the shared recordings store."
    )
    parser.add_argument("--config", default=str(DEFAULT_FATHOM_ENV_PATH))
    parser.add_argument("--store", default=str(DEFAULT_STORE_PATH))
    parser.add_argument("--state", default="")
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--apply", action="store_true")
    return parser.parse_args()


def api_get(url: str, api_key: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"X-Api-Key": api_key})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def list_meetings(api_key: str, days: int, api_base: str) -> list[dict[str, Any]]:
    created_after = (datetime.now(timezone.utc) - timedelta(days=days)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    params = urllib.parse.urlencode(
        {
            "created_after": created_after,
            "include_summary": "true",
            "include_action_items": "true",
            "include_transcript": "true",
        }
    )
    url = f"{api_base}/meetings?{params}"
    items: list[dict[str, Any]] = []

    while url:
        payload = api_get(url, api_key)
        items.extend(payload.get("items", []))
        next_cursor = payload.get("next_cursor")
        if next_cursor:
            url = f"{api_base}/meetings?{params}&cursor={urllib.parse.quote(str(next_cursor))}"
        else:
            url = ""
    return items


def build_recording(meeting: dict[str, Any], match_context: dict[str, Any], run_id: str) -> dict[str, Any]:
    source_id = str(
        meeting.get("recording_id")
        or meeting.get("recordingId")
        or meeting.get("id")
        or meeting.get("call_id")
        or ""
    )
    if not source_id:
        raise ValueError("Meeting payload is missing a stable recording identifier.")
    title = meeting.get("title") or meeting.get("meeting_title") or f"Fathom meeting {source_id}"
    summary_chunks = meeting.get("summary") or []
    summary_text = "\n".join(str(chunk) for chunk in summary_chunks) if isinstance(summary_chunks, list) else str(summary_chunks)
    transcript = meeting.get("transcript")
    action_items_raw = meeting.get("action_items") or []
    action_items = []
    for item in action_items_raw:
        if isinstance(item, dict):
            action_items.append(str(item.get("text") or item.get("title") or "").strip())
        else:
            action_items.append(str(item).strip())
    participants = [
        invitee.get("name") or invitee.get("email") or "Unknown"
        for invitee in meeting.get("calendar_invitees", [])
        if isinstance(invitee, dict)
    ]
    match_input = "\n".join(
        part
        for part in [
            title,
            "\n".join(participants),
            summary_text,
            "\n".join(item for item in action_items if item),
            transcript if isinstance(transcript, str) else "",
        ]
        if part
    )

    match = match_recording(
        summary_text=match_input or json.dumps(meeting),
        title=title,
        match_context=match_context,
    )
    occurred_at = (
        meeting.get("recording_start_time")
        or meeting.get("scheduled_start_time")
        or meeting.get("created_at")
        or now_iso()
    )
    return {
        "id": f"fathom:{source_id}",
        "source": "fathom",
        "kind": "call",
        "sourceId": source_id,
        "dedupeKey": compute_dedupe_key("fathom", source_id),
        "title": title,
        "occurredAt": occurred_at,
        "recordedOn": occurred_at[:10],
        "participants": participants,
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
            "summary": summary_text,
            "keyPoints": summary_chunks if isinstance(summary_chunks, list) else [],
            "actionItems": [item for item in action_items if item],
            "transcript": transcript if isinstance(transcript, str) else None,
        },
        "links": {
            "sourceUrl": meeting.get("url"),
            "shareUrl": meeting.get("share_url"),
            "notionUrl": None,
            "audioPath": None,
        },
        "metadata": {
            "importedFrom": "fathom_api",
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


def generate_digest(meetings: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "generatedAt": now_iso(),
        "emailDelivery": {
            "status": "stubbed",
            "reason": "Email sending is intentionally not wired in this foundation."
        },
        "stats": {
            "meetingCount": len(meetings),
        },
        "highlights": [
            {
                "recordingId": meeting.get("sourceId"),
                "title": meeting.get("title"),
                "project": meeting.get("project", {}).get("suggested", {}).get("label"),
            }
            for meeting in meetings[:10]
        ],
    }


def main() -> None:
    args = parse_args()
    config = load_runtime_config(Path(args.config).expanduser())
    api_key = config.get("FATHOM_API_KEY", "")
    if not api_key:
        raise SystemExit(
            "FATHOM_API_KEY is required. Set it in .config/recordings/fathom.env, "
            "via FATHOM_SYNC_CONFIG_FILE, or directly in the environment."
        )

    api_base = config.get("FATHOM_API_BASE", DEFAULT_API_BASE).rstrip("/")
    store_path = Path(args.store).expanduser()
    state_path = Path(args.state).expanduser() if args.state else store_path.with_name("fathom_sync_state.json")
    digest_path = store_path.with_name("fathom_digest.json")
    store = load_json(store_path, {"version": 1, "updatedAt": now_iso(), "recordings": []})
    state = load_json(state_path, {"lastSuccessfulRun": None, "lastSeenRecordingIds": []})
    match_context = load_match_context()
    run_id = f"fathom-sync-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"

    meetings = list_meetings(api_key=api_key, days=args.days, api_base=api_base)
    created = 0
    updated = 0
    imported: list[dict[str, Any]] = []
    existing_call_ids = {
        item.get("sourceId")
        for item in store.get("recordings", [])
        if item.get("source") == "fathom"
    }

    for meeting in meetings:
        recording = build_recording(meeting, match_context, run_id)
        store, action = upsert_recording(store, recording)
        imported.append(recording)
        if action == "created":
            created += 1
        else:
            updated += 1

    store["recordings"] = sorted(
        store.get("recordings", []),
        key=lambda item: item.get("occurredAt", ""),
        reverse=True,
    )
    store["updatedAt"] = now_iso()
    digest = generate_digest(imported)

    deduped_against_existing = len(
        [meeting for meeting in meetings if str(meeting.get("recording_id")) in existing_call_ids]
    )

    print(
        f"fathom sync dry_run={not args.apply} meetings={len(meetings)} created={created} updated={updated} already_present={deduped_against_existing}"
    )
    print(f"digest_path={digest_path}")

    if args.apply:
        write_json(store_path, store)
        write_json(digest_path, digest)
        state["lastSuccessfulRun"] = now_iso()
        state["lastSeenRecordingIds"] = [str(meeting.get("recording_id")) for meeting in meetings]
        write_json(state_path, state)
        print(f"wrote store={store_path} digest={digest_path} state={state_path}")
    else:
        print("dry run only; pass --apply to persist recordings, digest, and state")


if __name__ == "__main__":
    main()
