#!/bin/bash
set -euo pipefail

# Reports only:
#   - Oversized files (tables) for JS/MJS, SYS2, Markdown
#   - Total line counts by extension
#
# This is meant to quickly spot files that violate the code-size style guide.

YELLOW_THRESHOLD=500
RED_THRESHOLD=800

# Color output (only when stdout is a TTY).
if [[ -t 1 ]]; then
  COLOR_RED=$(tput setaf 1 2>/dev/null || true)
  COLOR_YELLOW=$(tput setaf 3 2>/dev/null || true)
  COLOR_RESET=$(tput sgr0 2>/dev/null || true)
else
  COLOR_RED=""
  COLOR_YELLOW=""
  COLOR_RESET=""
fi

TERM_COLS=$(tput cols 2>/dev/null || echo "${COLUMNS:-80}")

shorten_path() {
  local p="$1"
  local max="$2"
  local len=${#p}
  if (( len <= max || max <= 4 )); then
    printf "%s" "$p"
    return
  fi
  local keep=$((max - 1))
  if (( keep < 1 )); then keep=1; fi
  printf "…%s" "${p: -keep}"
}

colorize_count() {
  local count="$1"
  local padded="$2"

  if [[ -z "$COLOR_RESET" ]]; then
    printf "%s" "$padded"
    return
  fi

  if (( count > RED_THRESHOLD )); then
    printf "%s%s%s" "$COLOR_RED" "$padded" "$COLOR_RESET"
    return
  fi
  if (( count > YELLOW_THRESHOLD )); then
    printf "%s%s%s" "$COLOR_YELLOW" "$padded" "$COLOR_RESET"
    return
  fi
  printf "%s" "$padded"
}

compute_total_lines() {
  local -n files_ref="$1"
  if (( ${#files_ref[@]} == 0 )); then
    echo 0
    return
  fi
  printf '%s\0' "${files_ref[@]}" | xargs -0 wc -l | tail -n 1 | awk '{print $1}'
}

oversized_rows() {
  local min_lines="$1"
  local -n files_ref="$2"

  if (( ${#files_ref[@]} == 0 )); then
    return 0
  fi

  # wc format: "<lines> <path>", final line is the total which we drop.
  printf '%s\0' "${files_ref[@]}" | xargs -0 wc -l | sed '$d' | awk -v min="$min_lines" '$1 > min { print }'
}

render_oversized_table() {
  local title="$1"
  local min_lines="$2"
  local array_name="$3"
  local -n files_ref="$array_name"

  local -a rows=()
  mapfile -t rows < <(oversized_rows "$min_lines" "$array_name" | sort -nr)

  echo "--- ${title} oversized files (>${min_lines} lines) ---"

  local count=${#rows[@]}
  if (( count == 0 )); then
    echo "(none)"
    echo ""
    return
  fi

  local col_lines=7
  local col_level=6
  local col_path=$((TERM_COLS - col_lines - col_level - 6))
  if (( col_path < 32 )); then col_path=32; fi

  printf "%-${col_lines}s | %-${col_level}s | %s\n" "Lines" "Level" "Path"
  printf "%-${col_lines}s-+-%-${col_level}s-+-%s\n" \
    "$(printf '%*s' "$col_lines" | tr ' ' '-')" \
    "$(printf '%*s' "$col_level" | tr ' ' '-')" \
    "$(printf '%*s' "$col_path" | tr ' ' '-')"

  for entry in "${rows[@]}"; do
    local line_count file_path
    line_count=$(awk '{print $1}' <<<"$entry")
    file_path=$(awk '{ $1=""; sub(/^ +/,""); print }' <<<"$entry")

    local level="WARN"
    if (( line_count > RED_THRESHOLD )); then
      level="RED"
    fi

    local display_path
    display_path=$(shorten_path "$file_path" "$col_path")

    local num_padded
    printf -v num_padded "%6s" "$line_count"
    num_padded=$(colorize_count "$line_count" "$num_padded")
    printf "%-${col_lines}s | %-${col_level}s | %s\n" "$num_padded" "$level" "$display_path"
  done

  echo ""
}

files_to_process=()
while IFS= read -r -d '' file; do
  files_to_process+=("$file")
done < <(
  find . -path "*/node_modules" -prune -o -type f \( -name "*.js" -o -name "*.mjs" -o -name "*.sys2" -o -name "*.md" -o -name "*.html" \) -print0
)

if (( ${#files_to_process[@]} == 0 )); then
  echo "No JS/MJS/SYS2/MD/HTML files found."
  exit 0
fi

js_files=()
mjs_files=()
jsmjs_files=()
sys2_files=()
md_files=()
html_files=()

for file in "${files_to_process[@]}"; do
  case "$file" in
    *.js) js_files+=("$file"); jsmjs_files+=("$file") ;;
    *.mjs) mjs_files+=("$file"); jsmjs_files+=("$file") ;;
    *.sys2) sys2_files+=("$file") ;;
    *.md) md_files+=("$file") ;;
    *.html) html_files+=("$file") ;;
  esac
done

total_js_lines=$(compute_total_lines js_files)
total_mjs_lines=$(compute_total_lines mjs_files)
total_sys2_lines=$(compute_total_lines sys2_files)
total_md_lines=$(compute_total_lines md_files)
total_html_lines=$(compute_total_lines html_files)

echo "--- Oversized Files ---"
render_oversized_table "JS/MJS" "$YELLOW_THRESHOLD" jsmjs_files
render_oversized_table "SYS2" "$YELLOW_THRESHOLD" sys2_files
render_oversized_table "Markdown" "$YELLOW_THRESHOLD" md_files

total_all_lines=$((total_js_lines + total_mjs_lines + total_sys2_lines + total_md_lines + total_html_lines))
echo "--- Line Totals ---"
printf "%-8s | %-6s | %s\n" "Type" "Files" "Lines"
printf "%-8s-+-%-6s-+-%s\n" "--------" "------" "----------"
printf "%-8s | %6d | %s\n" ".js" "${#js_files[@]}" "$total_js_lines"
printf "%-8s | %6d | %s\n" ".mjs" "${#mjs_files[@]}" "$total_mjs_lines"
printf "%-8s | %6d | %s\n" ".sys2" "${#sys2_files[@]}" "$total_sys2_lines"
printf "%-8s | %6d | %s\n" ".md" "${#md_files[@]}" "$total_md_lines"
printf "%-8s | %6d | %s\n" ".html" "${#html_files[@]}" "$total_html_lines"
printf "%-8s | %6s | %s\n" "TOTAL" "-" "$total_all_lines"
echo ""
