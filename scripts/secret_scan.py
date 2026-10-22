import os
import re

PATTERNS = [
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "PEM Private Key"),
    (re.compile(r"(?i)(?:api[_-]?key|apikey|secret|private[_-]?key)\s*[:=]\s*['\"][0-9a-zA-Z_\-]{16,}['\"]"), "Hardcoded Secret/Key"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "AWS Access Key"),
    (re.compile(r"ghp_[0-9a-zA-Z]{36}"), "GitHub PAT"),
]

IGNORED_DIRS = {".venv", "node_modules", ".git", "contracts/out", "contracts/cache", "contracts/broadcast", "data/raw", "data/processed"}
IGNORED_FILES = {".env", ".keystore_password"}
IGNORED_EXTS = {".png", ".db", ".parquet", ".woff", ".woff2", ".pyc", ".jpg", ".jpeg", ".svg"}

hits = []
for root, dirs, files in os.walk("."):
    dirs[:] = [d for d in dirs if d not in IGNORED_DIRS and not d.startswith(".pytest") and not d.startswith(".hypothesis")]
    if any(ig in root.replace("\\", "/") for ig in IGNORED_DIRS):
        continue
    for f in files:
        if f in IGNORED_FILES or any(f.endswith(ext) for ext in IGNORED_EXTS):
            continue
        p = os.path.join(root, f)
        try:
            with open(p, "r", encoding="utf-8", errors="ignore") as fp:
                for idx, line in enumerate(fp, 1):
                    for pat, label in PATTERNS:
                        if pat.search(line):
                            hits.append((p, idx, label, line.strip()[:60]))
        except Exception:
            pass

print(f"Total secret scan hits: {len(hits)}")
for h in hits:
    print(f"{h[0]}:{h[1]} [{h[2]}] -> {h[3]}")
