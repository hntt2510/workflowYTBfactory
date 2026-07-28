from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    payload = json.load(sys.stdin)
    draft_dir = Path(payload["draftDirectory"])
    draft_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = draft_dir / "long_short_factory_manifest.json"
    manifest_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "manifestPath": str(manifest_path)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

