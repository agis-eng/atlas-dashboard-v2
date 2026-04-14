from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import yaml
except ModuleNotFoundError as error:
    raise SystemExit(
        "PyYAML is required for the recordings runners. Install it with "
        "`python3 -m pip install -r scripts/recordings/requirements.txt`."
    ) from error


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_STORE_PATH = REPO_ROOT / "data" / "recordings.json"
DEFAULT_KEYWORDS_PATH = REPO_ROOT / "data" / "recording-keywords.yaml"
DEFAULT_LEGACY_RULES_PATH = REPO_ROOT / "data" / "recording_project_rules.json"
DEFAULT_PROJECTS_PATH = REPO_ROOT / "data" / "projects.yaml"
DEFAULT_PARTNERS_PATH = REPO_ROOT / "data" / "partners.yaml"
DEFAULT_BRAINS_PATH = REPO_ROOT / "data" / "brains.yaml"


def default_config_dir() -> Path:
    configured = os.environ.get("ATLAS_RECORDINGS_CONFIG_DIR") or os.environ.get("RECORDINGS_CONFIG_DIR")
    if configured:
        return Path(configured).expanduser()
    return REPO_ROOT / ".config" / "recordings"


DEFAULT_VOICE_ENV_PATH = default_config_dir() / "voice-memos.env"
DEFAULT_FATHOM_ENV_PATH = default_config_dir() / "fathom.env"


@dataclass
class AssignmentMatch:
    entity_id: str | None
    entity_name: str | None
    confidence: str
    reason: str | None
    matched_by: str | None


@dataclass
class RecordingMatch:
    project: AssignmentMatch
    partner: AssignmentMatch
    brain: AssignmentMatch


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_env_file(env_path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not env_path.exists():
        return values

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def load_runtime_config(env_path: Path) -> dict[str, str]:
    config = read_env_file(env_path)
    config.update(os.environ)
    return config


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def load_yaml(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
    return default if loaded is None else loaded


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "recording"


def compute_dedupe_key(source: str, source_id: str) -> str:
    return f"{source}:{source_id}"


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize_keyword(value: Any) -> str:
    return normalize_text(value).lower()


def compact(values: list[Any]) -> list[Any]:
    return [value for value in values if value]


def load_match_context(
    keywords_path: Path = DEFAULT_KEYWORDS_PATH,
    legacy_rules_path: Path = DEFAULT_LEGACY_RULES_PATH,
    projects_path: Path = DEFAULT_PROJECTS_PATH,
    partners_path: Path = DEFAULT_PARTNERS_PATH,
    brains_path: Path = DEFAULT_BRAINS_PATH,
) -> dict[str, Any]:
    keywords_path = Path(os.environ.get("ATLAS_RECORDINGS_KEYWORDS_PATH", str(keywords_path))).expanduser()
    legacy_rules_path = Path(os.environ.get("ATLAS_RECORDINGS_LEGACY_RULES_PATH", str(legacy_rules_path))).expanduser()
    projects_path = Path(os.environ.get("ATLAS_RECORDINGS_PROJECTS_PATH", str(projects_path))).expanduser()
    partners_path = Path(os.environ.get("ATLAS_RECORDINGS_PARTNERS_PATH", str(partners_path))).expanduser()
    brains_path = Path(os.environ.get("ATLAS_RECORDINGS_BRAINS_PATH", str(brains_path))).expanduser()
    keywords = load_yaml(keywords_path, {})
    legacy_rules = load_json(legacy_rules_path, {"rules": []})
    projects = load_yaml(projects_path, {}).get("projects", [])
    partners = load_yaml(partners_path, {}).get("partners", [])
    brains = load_yaml(brains_path, {}).get("brains", [])
    return {
        "keywords": keywords,
        "legacy_rules": legacy_rules.get("rules", []),
        "projects": projects,
        "partners": partners,
        "brains": brains,
    }


def build_entity_map(items: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {
        str(item.get("id")): item
        for item in items
        if isinstance(item, dict) and item.get("id")
    }


def build_partner_project_index(partners: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    index: dict[str, list[dict[str, Any]]] = {}
    for partner in partners:
        for project_id in partner.get("projectIds", []) or []:
            index.setdefault(str(project_id), []).append(partner)
    return index


def build_candidate_keywords(entity: dict[str, Any], explicit_keywords: list[Any], extra_fields: list[str]) -> list[str]:
    values = []
    for field_name in extra_fields:
        raw_value = entity.get(field_name)
        if isinstance(raw_value, list):
            values.extend(raw_value)
        else:
            values.append(raw_value)
    values.extend(explicit_keywords)
    normalized = {
        normalize_keyword(value)
        for value in values
        if normalize_keyword(value) and len(normalize_keyword(value)) >= 3
    }
    return sorted(normalized, key=len, reverse=True)


def build_match_entries(match_context: dict[str, Any], entity_type: str) -> list[dict[str, Any]]:
    keywords_config = match_context.get("keywords", {})
    settings = keywords_config.get("settings", {}) if isinstance(keywords_config, dict) else {}
    entities = match_context.get("projects" if entity_type == "project" else "partners", [])
    entity_map = build_entity_map(entities)
    config_items = keywords_config.get(f"{entity_type}s", []) if isinstance(keywords_config, dict) else []
    derive_from_data = bool(settings.get(f"derive_{entity_type}_keywords_from_data", True))
    extra_fields = ["name", "id", "slug"]
    if entity_type == "project":
        extra_fields.append("clientId")

    entries: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for item in config_items:
        entity_id = str(item.get(f"{entity_type}_id") or "")
        entity = entity_map.get(entity_id)
        if not entity:
            continue
        seen_ids.add(entity_id)
        for keyword in build_candidate_keywords(entity, item.get("keywords", []) or [], extra_fields):
            entries.append(
                {
                    "entity_id": entity_id,
                    "entity_name": entity.get("name") or entity_id,
                    "keyword": keyword,
                    "brain_id": item.get("brain_id"),
                    "brain_name": item.get("brain_name"),
                    "matched_by": f"recording_keywords_{entity_type}",
                }
            )

    if derive_from_data:
        for entity in entities:
            entity_id = str(entity.get("id") or "")
            if not entity_id or entity_id in seen_ids:
                continue
            for keyword in build_candidate_keywords(entity, [], extra_fields):
                entries.append(
                    {
                        "entity_id": entity_id,
                        "entity_name": entity.get("name") or entity_id,
                        "keyword": keyword,
                        "brain_id": None,
                        "brain_name": None,
                        "matched_by": f"derived_{entity_type}_keywords",
                    }
                )

    if entity_type == "project":
        for rule in match_context.get("legacy_rules", []):
            entity_id = str(rule.get("projectId") or "")
            entity_name = rule.get("projectName") or entity_id
            if not entity_id:
                continue
            for keyword in rule.get("keywords", []) or []:
                normalized = normalize_keyword(keyword)
                if not normalized:
                    continue
                entries.append(
                    {
                        "entity_id": entity_id,
                        "entity_name": entity_name,
                        "keyword": normalized,
                        "brain_id": rule.get("brainId"),
                        "brain_name": rule.get("brainName"),
                        "matched_by": "legacy_recording_project_rules",
                    }
                )

    return sorted(entries, key=lambda entry: (-len(entry["keyword"]), entry["entity_name"]))


def select_best_match(text: str, entries: list[dict[str, Any]]) -> AssignmentMatch:
    haystack = normalize_keyword(text)
    if not haystack:
        return AssignmentMatch(None, None, "unknown", None, None)

    scores: dict[str, dict[str, Any]] = {}
    for entry in entries:
        keyword = entry["keyword"]
        if keyword and keyword in haystack:
            aggregate = scores.setdefault(
                entry["entity_id"],
                {
                    "entity_id": entry["entity_id"],
                    "entity_name": entry["entity_name"],
                    "hits": 0,
                    "max_keyword_length": 0,
                    "reason_keywords": [],
                    "matched_by": entry["matched_by"],
                    "brain_id": entry.get("brain_id"),
                    "brain_name": entry.get("brain_name"),
                },
            )
            aggregate["hits"] += 1
            aggregate["max_keyword_length"] = max(aggregate["max_keyword_length"], len(keyword))
            aggregate["reason_keywords"].append(keyword)
            if entry.get("brain_id") and not aggregate.get("brain_id"):
                aggregate["brain_id"] = entry.get("brain_id")
                aggregate["brain_name"] = entry.get("brain_name")

    if not scores:
        return AssignmentMatch(None, None, "unknown", None, None)

    winner = max(scores.values(), key=lambda item: (item["hits"], item["max_keyword_length"], item["entity_name"]))
    confidence = "high" if winner["hits"] >= 2 else "medium"
    keyword_preview = ", ".join(winner["reason_keywords"][:3])
    reason = f"Matched {winner['hits']} keyword rule{'s' if winner['hits'] != 1 else ''}: {keyword_preview}"
    return AssignmentMatch(
        winner["entity_id"],
        winner["entity_name"],
        confidence,
        reason,
        winner["matched_by"],
    )


def infer_partner_from_project(project_id: str | None, partner_project_index: dict[str, list[dict[str, Any]]]) -> AssignmentMatch:
    if not project_id:
        return AssignmentMatch(None, None, "unknown", None, None)
    partners = partner_project_index.get(project_id, [])
    if len(partners) != 1:
        return AssignmentMatch(None, None, "unknown", None, None)
    partner = partners[0]
    return AssignmentMatch(
        str(partner.get("id")),
        partner.get("name"),
        "medium",
        "Inferred from the matched project's partner relationship.",
        "partner_project_relationship",
    )


def infer_project_from_partner(partner_id: str | None, partner_map: dict[str, dict[str, Any]], project_map: dict[str, dict[str, Any]]) -> AssignmentMatch:
    if not partner_id:
        return AssignmentMatch(None, None, "unknown", None, None)
    partner = partner_map.get(partner_id)
    if not partner:
        return AssignmentMatch(None, None, "unknown", None, None)
    project_ids = [str(project_id) for project_id in partner.get("projectIds", []) or [] if project_id]
    if len(project_ids) != 1:
        return AssignmentMatch(None, None, "unknown", None, None)
    project = project_map.get(project_ids[0])
    if not project:
        return AssignmentMatch(None, None, "unknown", None, None)
    return AssignmentMatch(
        str(project.get("id")),
        project.get("name"),
        "low",
        "Inferred from a partner that maps to a single project.",
        "partner_project_relationship",
    )


def match_recording(summary_text: str, title: str, match_context: dict[str, Any]) -> RecordingMatch:
    haystack = f"{title}\n{summary_text}"
    project_map = build_entity_map(match_context.get("projects", []))
    partner_map = build_entity_map(match_context.get("partners", []))
    partner_project_index = build_partner_project_index(match_context.get("partners", []))

    project_entries = build_match_entries(match_context, "project")
    partner_entries = build_match_entries(match_context, "partner")
    project_match = select_best_match(haystack, project_entries)
    partner_match = select_best_match(haystack, partner_entries)

    if not partner_match.entity_id and project_match.entity_id:
        partner_match = infer_partner_from_project(project_match.entity_id, partner_project_index)

    if not project_match.entity_id and partner_match.entity_id:
        project_match = infer_project_from_partner(partner_match.entity_id, partner_map, project_map)

    brain_match = AssignmentMatch(None, None, "unknown", None, None)
    for entry in project_entries:
        if (
            entry["entity_id"] == project_match.entity_id
            and entry.get("brain_id")
        ):
            brain_match = AssignmentMatch(
                entry.get("brain_id"),
                entry.get("brain_name") or entry.get("brain_id"),
                project_match.confidence,
                "Inherited from the matched project keyword rule.",
                "project_keyword_brain_mapping",
            )
            break

    return RecordingMatch(
        project=project_match,
        partner=partner_match,
        brain=brain_match,
    )


def upsert_recording(store: dict[str, Any], recording: dict[str, Any]) -> tuple[dict[str, Any], str]:
    items = store.setdefault("recordings", [])
    for index, existing in enumerate(items):
        if existing.get("dedupeKey") == recording.get("dedupeKey"):
            recording["project"]["manual"] = existing.get("project", {}).get("manual", {"id": None, "label": None})
            recording["partner"]["manual"] = existing.get("partner", {}).get("manual", {"id": None, "label": None})
            recording["brain"]["manual"] = existing.get("brain", {}).get("manual", {"id": None, "label": None})
            recording["review"] = {
                "status": existing.get("review", {}).get("status", recording["review"]["status"]),
                "notes": existing.get("review", {}).get("notes", recording["review"].get("notes", "")),
                "assignedBy": existing.get("review", {}).get("assignedBy"),
                "assignedAt": existing.get("review", {}).get("assignedAt"),
            }
            existing_manual_fields = existing.get("metadata", {}).get("manualFields", {})
            recording["metadata"]["manualFields"] = {
                "projectRequired": existing_manual_fields.get(
                    "projectRequired",
                    recording["metadata"]["manualFields"].get("projectRequired", False),
                ),
                "partnerRequired": existing_manual_fields.get(
                    "partnerRequired",
                    recording["metadata"]["manualFields"].get("partnerRequired", False),
                ),
                "brainRequired": existing_manual_fields.get(
                    "brainRequired",
                    recording["metadata"]["manualFields"].get("brainRequired", False),
                ),
            }
            items[index] = recording
            return store, "updated"

    items.append(recording)
    return store, "created"
