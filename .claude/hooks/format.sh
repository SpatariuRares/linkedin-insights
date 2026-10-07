#!/bin/sh
# PostToolUse (Edit|Write): formats the touched file the way lint-staged would at commit time.
# Lint errors oxlint can't fix are sent back to Claude (exit 2) so it fixes them right away.
f=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')
[ -n "$f" ] && [ -f "$f" ] || exit 0
case "$f" in "$CLAUDE_PROJECT_DIR"/*) ;; *) exit 0 ;; esac
cd "$CLAUDE_PROJECT_DIR" || exit 0

out=$(npx --no-install prettier --write --ignore-unknown --log-level warn "$f" 2>&1) || {
  echo "prettier: $out" >&2
  exit 2
}

case "$f" in
  *.ts | *.tsx | *.js | *.mjs)
    out=$(npx --no-install oxlint --fix "$f" 2>&1) || {
      echo "oxlint: $out" >&2
      exit 2
    }
    ;;
esac
exit 0
