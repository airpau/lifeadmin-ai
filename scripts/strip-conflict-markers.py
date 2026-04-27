#!/usr/bin/env python3
"""
Strip merge-conflict markers from the repo.

The cherry-pick of 6ed4f978 committed files that still contained conflict
markers because the resolve-merge-conflicts.sh script's `git checkout --ours`
calls didn't persist (probably the index.lock issues we saw).

This script bypasses git entirely. It rewrites each file with the chosen
side of every conflict block, based on the decisions in
MERGE_CONFLICT_RESOLUTIONS.md. Then you commit and push.

Sides:
  "head"    — keep content between `<<<<<<< HEAD` and `=======`
  "theirs"  — keep content between `=======` and `>>>>>>>`
  "both"    — keep both sides concatenated, delete only the marker lines

Files not listed default to "head" (safer for production stability).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# ---------- decision matrix ----------
HEAD_FILES = [
    "src/app/auth/login/page.tsx",
    "src/app/auth/signup/page.tsx",
    "src/app/pricing/page.tsx",
    "src/app/careers/page.tsx",
    "src/app/about/page.tsx",
    "src/app/blog/_shared.tsx",
    "src/app/preview/homepage/page.tsx",
    "src/app/api/export/csv/route.ts",
    "src/app/api/export/xlsx/route.ts",
    "src/components/DataExportCard.tsx",
    "src/app/dashboard/export/page.tsx",
    "src/app/dashboard/tutorials/page.tsx",
    "src/app/dashboard/settings/telegram/page.tsx",
    "src/app/dashboard/money-hub/page.tsx",
    "src/app/dashboard/profile/page.tsx",
    "src/app/api/disputes/[id]/link-email-thread/route.ts",
    "src/app/api/disputes/[id]/sync-replies-now/route.ts",
    "src/app/api/preview/homepage-stats/route.ts",
    "package.json",
    "CLAUDE.md",
    "src/app/dashboard/page.tsx",
    "src/app/layout.tsx",
    "vercel.json",
]

THEIRS_FILES = [
    "mcp-server/src/index.ts",
    "src/app/api/cron/trial-expiry/route.ts",
    "src/lib/mcp-auth.ts",
    "src/lib/mcp-tokens.ts",
    "src/app/api/mcp/transactions/route.ts",
    "src/app/api/mcp/tokens/route.ts",
    "src/app/dashboard/settings/mcp/page.tsx",
    "src/lib/plan-limits.ts",
    "src/lib/savings-utils.ts",
    "src/lib/price-increase-detector.ts",
    "src/lib/dispute-sync/types.ts",
    "src/app/dashboard/contracts/page.tsx",
    "src/app/dashboard/contract-vault/page.tsx",
    "src/app/dashboard/deals/page.tsx",
    "src/app/dashboard/spending/page.tsx",
    "src/app/dashboard/rewards/page.tsx",
    "src/app/dashboard/profile/report/page.tsx",
    "src/app/dashboard/admin/legal-refs/page.tsx",
    "src/app/dashboard/admin/legal-updates/page.tsx",
    # large files where the script hit conflicts past 8KB on the first pass:
    "src/app/pricing/styles.css",
]

# Additive: keep both blocks, just strip the marker lines
BOTH_FILES = [
    "src/components/NotificationBell.tsx",
    "src/components/dispute/WatchdogCard.tsx",
    "src/lib/dispute-sync/fetchers.ts",
    "src/lib/dispute-sync/sync-runner.ts",
    "src/app/dashboard/money-hub/payments/page.tsx",
]

# Default = head (safer for the dangerous five — production stability wins)
DEFAULT_SIDE = "head"

# ---------- regex ----------
# Match a single conflict block. The =====    line separates ours from theirs.
# We use re.DOTALL on each block via \n char class, and capture both halves.
CONFLICT_RE = re.compile(
    r"<<<<<<<[^\n]*\n(?P<head>.*?)^=======[^\n]*\n(?P<theirs>.*?)^>>>>>>>[^\n]*\n",
    re.MULTILINE | re.DOTALL,
)


def resolve(content: str, side: str) -> tuple[str, int]:
    """Replace all conflict blocks in content with the chosen side."""
    blocks = 0

    def repl(m: re.Match) -> str:
        nonlocal blocks
        blocks += 1
        head = m.group("head")
        theirs = m.group("theirs")
        if side == "head":
            return head
        if side == "theirs":
            return theirs
        if side == "both":
            return head + theirs
        raise ValueError(f"unknown side: {side}")

    return CONFLICT_RE.sub(repl, content), blocks


def process_file(path: Path, side: str) -> int:
    if not path.exists():
        return -1
    text = path.read_text()
    if "<<<<<<<" not in text:
        return 0
    out, n = resolve(text, side)
    if n > 0:
        path.write_text(out)
    return n


def main() -> int:
    decisions: dict[str, str] = {}
    for f in HEAD_FILES:
        decisions[f] = "head"
    for f in THEIRS_FILES:
        decisions[f] = "theirs"
    for f in BOTH_FILES:
        decisions[f] = "both"

    # Find every file with markers (excluding node_modules & node_dl & .git)
    EXCLUDE_PARTS = {"node_modules", "node_dl", ".git", ".next", "dist", "build"}
    EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".json", ".sql", ".md", ".css"}

    found: list[Path] = []
    for path in REPO.rglob("*"):
        if not path.is_file():
            continue
        if any(part in EXCLUDE_PARTS for part in path.parts):
            continue
        if path.suffix not in EXTENSIONS:
            continue
        try:
            head = path.read_text(errors="ignore")
        except Exception:
            continue
        if "<<<<<<<" in head:
            found.append(path)

    print(f"Found {len(found)} files with conflict markers\n")

    total_blocks = 0
    head_count = theirs_count = both_count = default_count = 0

    for path in sorted(found):
        rel = path.relative_to(REPO).as_posix()
        side = decisions.get(rel, DEFAULT_SIDE)
        n = process_file(path, side)
        if n <= 0:
            continue
        total_blocks += n
        tag = side.upper()
        if rel in HEAD_FILES:
            head_count += 1
        elif rel in THEIRS_FILES:
            theirs_count += 1
        elif rel in BOTH_FILES:
            both_count += 1
        else:
            default_count += 1
            tag += " (default)"
        print(f"  {tag:18}  {n:3} block(s)  {rel}")

    print(
        f"\nResolved {total_blocks} conflict blocks: "
        f"{head_count} head | {theirs_count} theirs | "
        f"{both_count} both | {default_count} default-to-head"
    )

    # Final verify
    remaining = 0
    for path in REPO.rglob("*"):
        if not path.is_file():
            continue
        if any(part in EXCLUDE_PARTS for part in path.parts):
            continue
        if path.suffix not in EXTENSIONS:
            continue
        try:
            head = path.read_text(errors="ignore")
        except Exception:
            continue
        if "<<<<<<<" in head:
            remaining += 1
            print(f"  STILL HAS MARKERS: {path.relative_to(REPO)}")

    if remaining:
        print(f"\n❌ {remaining} files still have markers — manual review needed")
        return 1

    print("\n✅ all clear — commit & push")
    return 0


if __name__ == "__main__":
    sys.exit(main())
