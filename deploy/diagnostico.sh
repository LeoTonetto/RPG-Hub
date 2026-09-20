#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# Diagnóstico do Hub-RPG na VPS
#
#   ./deploy/diagnostico.sh          confere a porta padrão (3001)
#   ./deploy/diagnostico.sh 3002     confere outra porta
#
# Responde três perguntas:
#   1. quem está ocupando a porta?
#   2. o container está de pé?
#   3. o servidor responde?
# ══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

PORTA="${1:-${HOST_PORT:-3001}}"

azul()  { printf '\n\033[1;36m── %s\033[0m\n' "$1"; }
ok()    { printf '  \033[0;32m✓\033[0m %s\n' "$1"; }
aten()  { printf '  \033[0;33m!\033[0m %s\n' "$1"; }
ruim()  { printf '  \033[0;31m✗\033[0m %s\n' "$1"; }

# ══════════════════════════════════════════════════════════════════════════════
azul "Porta $PORTA"

LINHA=$(ss -tulpn 2>/dev/null | grep ":$PORTA " || true)

if [ -z "$LINHA" ]; then
    ok "Livre. Nada ocupando."
else
    echo "$LINHA" | sed 's/^/     /'
    PID=$(printf '%s' "$LINHA" | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)

    if [ -n "${PID:-}" ]; then
        CMD=$(ps -o cmd= -p "$PID" 2>/dev/null | head -1)
        echo
        aten "Ocupada pelo PID $PID"
        echo "     comando: $CMD"

        # De qual serviço do systemd esse processo veio?
        UNIDADE=$(systemctl status "$PID" 2>/dev/null | head -1 | grep -oE '[a-zA-Z0-9_.@-]+\.service' | head -1 || true)
        [ -n "${UNIDADE:-}" ] && echo "     serviço: $UNIDADE"

        echo
        # ── Veredito ────────────────────────────────────────────────────────
        if printf '%s' "$CMD" | grep -q 'docker-proxy'; then
            aten "É outro CONTAINER que já publicou esta porta."
            echo "     Veja qual:  docker ps --format '{{.Names}}\t{{.Ports}}'"
            echo "     Solução: mude HOST_PORT no .env (veja o fim deste relatório)."

        elif printf '%s' "$CMD" | grep -qE 'server/standalone\.js|hub-rpg'; then
            ruim "É o PRÓPRIO Hub-RPG rodando FORA do container."
            echo
            echo "     Provavelmente sobrou da instalação direta (deploy/LEIA-ME.md)."
            echo "     Rodar os dois ao mesmo tempo dá confusão: as salas ficam"
            echo "     registradas num servidor e os jogadores conectam no outro."
            echo
            echo "     Para desligar e liberar a porta:"
            echo "         systemctl disable --now hub-rpg"
            echo "         docker compose up -d"

        elif printf '%s' "$CMD" | grep -q 'node'; then
            aten "É um processo Node, mas NÃO parece ser o Hub-RPG."
            echo "     Olhe o comando acima antes de mexer — pode ser outro projeto seu."
            echo "     O caminho seguro é mudar a porta do Hub-RPG (veja o fim)."

        else
            aten "Ocupada por outro serviço."
            echo "     O caminho seguro é mudar a porta do Hub-RPG (veja o fim)."
        fi
    fi
fi

# ══════════════════════════════════════════════════════════════════════════════
azul "Container"

if ! command -v docker >/dev/null 2>&1; then
    aten "Docker não está instalado nesta máquina."
else
    ESTADO=$(docker inspect -f '{{.State.Status}}' hub-rpg 2>/dev/null || echo "inexistente")
    case "$ESTADO" in
        running)
            SAUDE=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}sem-healthcheck{{end}}' hub-rpg 2>/dev/null)
            ok "Rodando (saúde: $SAUDE)"
            ;;
        created)
            ruim "Criado mas NÃO iniciou — quase sempre é a porta ocupada."
            echo "     Motivo registrado pelo Docker:"
            docker inspect -f '{{.State.Error}}' hub-rpg 2>/dev/null | sed 's/^/       /'
            ;;
        exited)
            ruim "Parou. Últimas linhas do log:"
            docker logs --tail 20 hub-rpg 2>&1 | sed 's/^/       /'
            ;;
        restarting)
            ruim "Reiniciando em loop. Últimas linhas do log:"
            docker logs --tail 20 hub-rpg 2>&1 | sed 's/^/       /'
            ;;
        inexistente)
            aten "Container hub-rpg não existe. Rode: docker compose up -d --build"
            ;;
        *)
            aten "Estado: $ESTADO"
            ;;
    esac
fi

# ══════════════════════════════════════════════════════════════════════════════
azul "Servidor respondendo"

RESP=$(curl -s -m 5 "http://localhost:$PORTA/health" 2>/dev/null || true)
if printf '%s' "$RESP" | grep -q '"ok":true'; then
    ok "De dentro da VPS: $RESP"
    echo
    echo "     Agora teste DO SEU PC, no PowerShell:"
    echo "         curl http://\$(curl -s ifconfig.me):$PORTA/health"
    echo "     (ou troque pelo IP da VPS)"
    echo "     Se falhar lá e funcionar aqui, é firewall:"
    echo "         ufw allow $PORTA/tcp"
    echo "         + regra no painel da Hostinger (hPanel > VPS > Firewall)"
else
    ruim "Não respondeu em http://localhost:$PORTA/health"
fi

# ══════════════════════════════════════════════════════════════════════════════
azul "Como mudar a porta"
cat <<EOF
     Crie (ou edite) o arquivo .env ao lado do docker-compose.yml:

         echo "HOST_PORT=3002" > .env
         docker compose up -d

     Só a porta EXTERNA muda. Por dentro o servidor continua na 3001, então
     nada mais precisa ser ajustado.

     Depois, libere a porta nova e use o endereço novo no app:
         ufw allow 3002/tcp          (+ regra no painel da Hostinger)
         http://SEU_IP:3002
EOF
echo
