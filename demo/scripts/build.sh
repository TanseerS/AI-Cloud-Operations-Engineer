#!/usr/bin/env bash
# Assembles demo-video.mp4 from real application captures and title cards.
#
# Each segment is encoded on its own and concatenated, rather than built as one giant
# filter graph: it is far easier to re-cut a single scene, and a failure points at the
# scene that caused it. Every segment is 1920x1080 @30fps, and -an is set on the final
# mux so the file carries no audio stream at all.
set -euo pipefail
SC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAW="$SC/raw"; CARD="$SC/cards"; SEG="$SC/scenes"
rm -rf "$SEG"; mkdir -p "$SEG"
i=0
FADE=0.5

still() { # <png> <seconds>
  i=$((i+1)); local out; out="$(printf '%s/%03d.mp4' "$SEG" "$i")"
  local d="$2"; local fo; fo=$(python3 -c "print(max(0,$d-$FADE))")
  ffmpeg -y -loglevel error -loop 1 -i "$1" -t "$d" \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=#0c161c,fade=t=in:st=0:d=$FADE,fade=t=out:st=$fo:d=$FADE,format=yuv420p" \
    -r 30 -c:v libx264 -preset medium -crf 18 "$out"
  echo "file '$out'" >> "$SEG/list.txt"
}

seq_() { # <dir> <prefix> <fps>
  i=$((i+1)); local out; out="$(printf '%s/%03d.mp4' "$SEG" "$i")"
  local n; n=$(ls "$1/$2"-*.png | wc -l | tr -d ' ')
  local d; d=$(python3 -c "print(round($n/$3,2))")
  local fo; fo=$(python3 -c "print(max(0,$d-$FADE))")
  ffmpeg -y -loglevel error -framerate "$3" -i "$1/$2-%04d.png" \
    -vf "scale=1920:1080,fade=t=in:st=0:d=$FADE,fade=t=out:st=$fo:d=$FADE,format=yuv420p" \
    -r 30 -c:v libx264 -preset medium -crf 18 "$out"
  echo "file '$out'" >> "$SEG/list.txt"
}

# 1 — the problem
still "$CARD/c1-problem.png"            4.5
still "$RAW/01-overview-top.png"        5.0
still "$RAW/02-overview-health.png"     4.5
# 2 — detect
still "$CARD/c2-detect.png"             5.5
still "$RAW/03-issues-top.png"          4.0
still "$RAW/04-issue-rollback.png"      5.5
still "$RAW/05-issue-evidence.png"      6.0
# 3 — analyze
still "$CARD/c3-analyze.png"            4.0
seq_  "$RAW/burst-ai"      ai           10
still "$RAW/08-ai-diagnosis.png"        5.0
still "$CARD/c3b-quote.png"             6.5
# 4 — plan & approve
still "$CARD/c4-plan.png"               5.0
still "$RAW/09-plans-top.png"           4.0
still "$RAW/10-plan-rollback.png"       7.0
still "$RAW/11-approved.png"            5.0
# 5 — execute
still "$CARD/c5-execute.png"            5.0
seq_  "$RAW/burst-exec"    ex           12
# 6 — verify
still "$CARD/c6-verify.png"             5.5
still "$RAW/12-verified.png"            9.0
still "$RAW/13-verification-checks.png" 6.0
# 7 — reset
still "$CARD/c7-reset.png"              4.5
still "$RAW/14-lab-before-reset.png"    3.5
seq_  "$RAW/burst-reset"   rs           11
still "$RAW/16-reset-2.png"             5.0
still "$RAW/17-automation.png"          4.5
# 8 — close
still "$CARD/c8-close.png"              8.0

ffmpeg -y -loglevel error -f concat -safe 0 -i "$SEG/list.txt" \
  -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -r 30 -movflags +faststart \
  -an "$SC/demo-video.mp4"
echo "built: $SC/demo-video.mp4"
