#!/usr/bin/env bash
# Atualiza o servidor em container a partir do GitHub.
#   cd /opt/hub-rpg && ./deploy/atualizar-docker.sh
#
# As cenas já enviadas não se perdem: ficam num volume separado da imagem.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ Baixando as mudanças..."
git pull

echo "→ Reconstruindo e subindo..."
docker compose up -d --build

echo "→ Esperando ficar saudável..."
for i in $(seq 1 30); do
    estado=$(docker inspect -f '{{.State.Health.Status}}' hub-rpg 2>/dev/null || echo "sem-healthcheck")
    case "$estado" in
        healthy)
            echo "✓ No ar."
            curl -s http://localhost:3001/health && echo
            exit 0 ;;
        sem-healthcheck)
            # Container sem healthcheck: confia no status de execução
            if [ "$(docker inspect -f '{{.State.Running}}' hub-rpg 2>/dev/null)" = "true" ]; then
                echo "✓ Rodando."
                exit 0
            fi ;;
    esac
    sleep 2
done

echo "✗ Não ficou saudável a tempo. Últimas linhas do log:"
docker compose logs --tail 40
exit 1
