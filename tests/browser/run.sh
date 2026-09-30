#!/bin/sh
# Browser test: loads the card in headless Chromium with a fake `hass` fed by
# a real week of statistics (fixture.json: three sensors renamed to neutral
# ids, the outdoor series cleaned of direct-sun spikes) and checks what it renders.
#   tests/browser/run.sh             -> results, exit code 1 on failure
#   tests/browser/run.sh --shot      -> also writes docs/screenshot.png
set -e
cd "$(dirname "$0")/../.."
PORT=${PORT:-8765}
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
# fresh profile every run: a persistent one can serve a CACHED copy of the
# card, and the test would silently check an old version
PROFILE=$(mktemp -d)
trap 'kill $SERVER 2>/dev/null; rm -rf "$PROFILE"' EXIT
sleep 1
CHROME=${CHROME:-$(command -v chromium || command -v chromium-browser || command -v google-chrome)}
FLAGS="--headless --no-sandbox --disable-gpu --hide-scrollbars --virtual-time-budget=20000 --user-data-dir=$PROFILE"
OUT=$("$CHROME" $FLAGS --dump-dom "http://127.0.0.1:$PORT/tests/browser/harness.html" 2>/dev/null \
  | sed -n '/<pre id="results">/,/<\/pre>/p' | sed -e 's/<[^>]*>//g' -e 's/&gt;/>/g' -e 's/&lt;/</g' -e 's/&amp;/\&/g')
echo "$OUT"
if [ "$1" = "--shot" ]; then
  mkdir -p docs
  "$CHROME" $FLAGS --window-size=632,380 --screenshot=docs/screenshot.png \
    "http://127.0.0.1:$PORT/tests/browser/harness.html?shot=1" >/dev/null 2>&1
  echo "screenshot: docs/screenshot.png"
fi
echo "$OUT" | grep -q "^OK " 
