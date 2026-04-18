#!/bin/bash
# start-demo.sh — Launch Magic Lens demo with SEedance proxy
# Run this script before opening the demo in your browser.

echo "=== Magic Lens Demo Launcher ==="
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Start the SEedance CORS proxy on port 3001
echo "[1/2] Starting SEedance proxy on port 3001..."
node "$SCRIPT_DIR/seedance-proxy.js" &> /tmp/seedance-proxy.log &
PROXY_PID=$!
sleep 2

if curl -s http://localhost:3001/health > /dev/null 2>&1; then
  echo "      ✓ Proxy running (PID $PROXY_PID)"
else
  echo "      ✗ Proxy failed to start — check /tmp/seedance-proxy.log"
  exit 1
fi

# Start the HTTP file server on port 8765
echo "[2/2] Starting demo server on port 8765..."
cd "$SCRIPT_DIR"
python3 -m http.server 8765 &> /tmp/demo-server.log &
SERVER_PID=$!
sleep 1

echo ""
echo "=== Demo is ready ==="
echo "  Open: http://localhost:8765/magic_lens_multimodal.html"
echo ""
echo "  Proxy PID:  $PROXY_PID"
echo "  Server PID: $SERVER_PID"
echo ""
echo "Press Ctrl+C to stop both servers."

wait
