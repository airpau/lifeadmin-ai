#!/bin/bash
cd "$(dirname "$0")"
echo "=== Pushing to GitHub ==="
git push origin master 2>&1
echo ""
echo "=== Done ==="
echo "You can close this window."
read -p "Press Enter to close..."
