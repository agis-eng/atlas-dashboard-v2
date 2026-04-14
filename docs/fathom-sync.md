# Fathom Sync

Daily sync entrypoint:

```bash
python3 -m pip install -r scripts/recordings/requirements.txt
npm run sync:fathom -- --apply
```

The runner reads config from one of these locations, in order:

```bash
FATHOM_SYNC_CONFIG_FILE=/absolute/path/to/fathom.env
ATLAS_RECORDINGS_CONFIG_DIR=/absolute/path/to/config-dir
RECORDINGS_CONFIG_DIR=/absolute/path/to/config-dir
```

Default config path if none is set:

```bash
/Users/eriklaine/.openclaw/workspace/atlas-dashboard-v2/.config/recordings/fathom.env
```

Example config file:

```bash
cp .config/recordings/fathom.env.example .config/recordings/fathom.env
```

Required config:

```bash
FATHOM_API_KEY=...
```

Optional config:

```bash
FATHOM_API_BASE=https://api.fathom.ai/external/v1
```

Useful commands:

```bash
npm run sync:fathom
npm run sync:fathom -- --apply
npm run sync:fathom -- --days 2
npm run recordings:bootstrap
```

Voice memo runner:

```bash
python3 -m pip install -r scripts/recordings/requirements.txt
cp .config/recordings/voice-memos.env.example .config/recordings/voice-memos.env
npm run sync:voice-memos -- --apply
```

Voice memo config:

```bash
VOICE_MEMO_SOURCE_DIR=/absolute/path/to/just-press-record/exports
```

Dashboard review:

```bash
npm run dev
# then open /recordings
```

Cron example:

```bash
15 6 * * * cd /Users/eriklaine/.openclaw/workspace/atlas-dashboard-v2 && /usr/bin/env npm run sync:fathom -- --apply >> /tmp/atlas-fathom-sync.log 2>&1
45 6 * * * cd /Users/eriklaine/.openclaw/workspace/atlas-dashboard-v2 && /usr/bin/env npm run sync:voice-memos -- --apply >> /tmp/atlas-voice-memos.log 2>&1
```
