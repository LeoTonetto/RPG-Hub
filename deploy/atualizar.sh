#!/usr/bin/env bash
# Atualiza o servidor na VPS a partir do GitHub.
#   cd /opt/hub-rpg && ./deploy/atualizar.sh
set -euo pipefail

cd "$(dirname "$0")/.."
echo "→ Baixando as mudanças..."
git pull

echo "→ Conferindo dependências..."
npm ci --omit=dev

echo "→ Reiniciando o serviço..."
systemctl restart hub-rpg
sleep 2

if systemctl is-active --quiet hub-rpg; then
    echo "✓ No ar."
    curl -s http://localhost:"${PORT:-3001}"/health || true
    echo
else
    echo "✗ O serviço não subiu. Veja o que houve:"
    journalctl -u hub-rpg -n 30 --no-pager
    exit 1
fi
