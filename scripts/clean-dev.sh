#!/usr/bin/env bash
# clean-dev.sh – kill any stale processes and clear emulator databases
# Ports used by the project (backend + Firebase emulators)
PORTS=(4001 9100 9199 4002 9399 5173 5174 5432)

for p in "${PORTS[@]}"; do
  PIDS=$(lsof -ti :$p)
  if [ -n "$PIDS" ]; then
    echo "Killing process(es) on port $p: $PIDS"
    kill -9 $PIDS 2>/dev/null || true
  fi
done

# Clear Data Connect local Postgres data if requested or stale
if [ -d "dataconnect/.dataconnect/pgliteData" ]; then
  echo "Clearing Data Connect local database (pgliteData)..."
  rm -rf dataconnect/.dataconnect/pgliteData
fi

echo "Clean‑up complete. You can now run 'npm run dev' again."
