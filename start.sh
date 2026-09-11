#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  npm install
fi
if [ ! -f .env ]; then
  echo "Copy .env.example to .env and fill it in first." >&2
  exit 1
fi
npm run db:up
npm run server &
api=$!
trap 'kill "$api" 2>/dev/null' EXIT INT TERM
npm run dev
