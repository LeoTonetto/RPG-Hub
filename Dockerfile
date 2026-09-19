# ══════════════════════════════════════════════════════════════════════════════
# Hub-RPG — servidor de salas
#
# Imagem só do BACKEND. O app do mestre e dos jogadores continua sendo o
# Electron instalado em cada máquina; isto aqui é o servidor que eles acessam.
#
# Build e execução ficam em deploy/DOCKER.md. Em resumo:
#     docker compose up -d --build
# ══════════════════════════════════════════════════════════════════════════════

FROM node:20-alpine

# tini cuida dos sinais: sem ele, o `docker stop` demora 10s e mata na marra
RUN apk add --no-cache tini

WORKDIR /app

# ── Dependências primeiro, em camada própria ─────────────────────────────────
# Assim o `npm ci` só roda de novo quando o package-lock muda, e não a cada
# alteração no código do servidor.
COPY package.json package-lock.json ./

# --omit=dev pula electron e electron-builder (centenas de MB) — eles só servem
# para empacotar o app de desktop, não para rodar o servidor.
RUN npm ci --omit=dev && npm cache clean --force

# ── Código do servidor ───────────────────────────────────────────────────────
# Copiamos SÓ o backend, de propósito:
#   • a imagem fica pequena;
#   • o express.static do server.js serve o diretório do app, então deixar o
#     src/ e o index.html de fora evita publicar o código do cliente numa
#     porta aberta para a internet.
#
# ⚠ Se um dia o servidor passar a precisar de algum arquivo fora daqui,
#   acrescente o COPY correspondente — senão o container sobe e quebra com
#   "Cannot find module".
COPY server.js ./
COPY server/ ./server/

# ── Pasta das cenas ──────────────────────────────────────────────────────────
# Criada com o dono certo ANTES do volume ser montado: um volume nomeado herda
# a permissão do diretório que existe na imagem. Sem isto, o volume nasceria do
# root e o processo (usuário `node`) não conseguiria gravar os uploads.
RUN mkdir -p /dados/cenas && chown -R node:node /dados /app

# Não roda como root
USER node

ENV NODE_ENV=production \
    PORT=3001 \
    SCENES_DIR=/dados/cenas \
    SCENE_MAX_MB=150 \
    SCENE_KEEP=30

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/standalone.js"]
