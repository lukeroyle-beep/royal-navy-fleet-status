#!/bin/sh
# Build-time administrator check, not a worker operation.
set -eu
[ "$#" = 1 ]
dependency_list=$(/usr/bin/otool -L "$1")
[ -n "$dependency_list" ]
printf '%s\n' "$dependency_list" | /usr/bin/tail -n +2 | /usr/bin/awk 'NF {count++} $1 !~ /^\/System\/Library\// && $1 !~ /^\/usr\/lib\// {bad=1} END {exit bad || count<1}'
load_commands=$(/usr/bin/otool -l "$1")
[ -n "$load_commands" ]
printf '%s\n' "$load_commands" | /usr/bin/awk '/LC_RPATH/ {bad=1} END {exit bad}'
