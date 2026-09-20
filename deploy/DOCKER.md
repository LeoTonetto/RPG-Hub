# Hub-RPG em container na VPS da Hostinger

Caminho recomendado. O servidor fica isolado num container próprio: não suja a
VPS com Node e dependências soltas, não briga com outros projetos que você
rodar ali, e atualizar é um comando.

Se preferir instalar direto no sistema, sem Docker, use
[LEIA-ME.md](LEIA-ME.md) — os dois chegam no mesmo lugar.

---

## Antes de começar

Anote o **IP da VPS** (hPanel → VPS → Visão geral). Onde estiver escrito
`SEU_IP`, troque por ele.

---

## 1. Instalar o Docker

Entre na VPS:

```bash
ssh root@SEU_IP
```

Confira se já tem — alguns planos da Hostinger vêm com Docker pronto, e o
hPanel oferece um template com ele:

```bash
docker --version
```

Se responder uma versão, pule para o passo 2. Se não:

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker --version
docker compose version
```

---

## 2. Baixar o projeto

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/LeoTonetto/RPG-Hub.git hub-rpg
cd hub-rpg
```

> **Repositório privado?** O GitHub não aceita mais senha comum. Gere um
> Personal Access Token em github.com → Settings → Developer settings →
> Tokens e use o token no lugar da senha.

---

## 3. Subir

```bash
docker compose up -d --build
```

A primeira vez demora um ou dois minutos (baixa a imagem do Node e instala as
dependências). Depois:

```bash
docker compose ps
```

Tem que aparecer `hub-rpg` com status **running** e, depois de uns 15 segundos,
**(healthy)**.

Teste por dentro:

```bash
curl http://localhost:3001/health
```

Se voltar `{"ok":true,...}`, o container está funcionando.

### Deu "created" em vez de "running"?

Container criado mas que não inicia é, quase sempre, **porta ocupada**: alguma
outra coisa na VPS já está usando a 3001, e o Docker não consegue publicar.

Rode o diagnóstico — ele diz exatamente quem é e o que fazer:

```bash
bash deploy/diagnostico.sh
```

Os dois desfechos possíveis:

**a) É o próprio Hub-RPG rodando fora do container.** Acontece se você tiver
experimentado a instalação direta antes. Não deixe os dois de pé: as salas
ficariam registradas num servidor e os jogadores conectando no outro. Desligue
o de fora:

```bash
systemctl disable --now hub-rpg
docker compose up -d
```

**b) É outro serviço seu.** Aí mude a porta externa do Hub-RPG, que é só uma
linha:

```bash
echo "HOST_PORT=3002" > .env
docker compose up -d
```

Por dentro o servidor continua na 3001; muda só por onde ele é acessado. Depois
libere a porta nova no passo 4 e use `http://SEU_IP:3002` no app.

---

## 4. Abrir a porta 3001

São **dois** firewalls, e esquecer o segundo é o erro mais comum.

**a) Firewall do Ubuntu:**

```bash
ufw allow 22/tcp
ufw allow 3001/tcp      # ou a porta que você pôs em HOST_PORT
ufw --force enable
```

> Libere a 22 **antes** de ligar o ufw, senão você se tranca para fora da
> própria VPS.

**b) Firewall da Hostinger:** hPanel → VPS → Firewall → regra aceitando **TCP
porta 3001** de qualquer origem. Se não houver firewall ativo no painel, não
precisa mexer.

**Confirme do seu PC**, no PowerShell:

```bash
curl http://SEU_IP:3001/health
```

Voltou o JSON? Acabou a parte do servidor.

---

## 5. Configurar o app

No Hub-RPG, na tela de criar sala:

1. Em **Onde hospedar a sala**, clique em **🖥 Servidor**.
2. Digite `http://SEU_IP:3001` e aperte Tab.
3. Deve aparecer **"Servidor no ar"** em verde.
4. **Criar Sala**.

O código de 6 letras é copiado sozinho. **Seus jogadores entram só com o
código** — o endereço agora é fixo, não precisa mandar URL.

A escolha fica gravada. Para voltar ao ngrok, clique em **🔗 ngrok** antes de
criar a sala.

---

## Comandos do dia a dia

| Para quê | Comando |
|---|---|
| Ver os logs ao vivo | `docker compose logs -f` |
| Últimas 50 linhas | `docker compose logs --tail 50` |
| Reiniciar | `docker compose restart` |
| Parar | `docker compose down` |
| Subir de novo | `docker compose up -d` |
| Ver se está de pé | `docker compose ps` |
| Entrar no container | `docker compose exec hub-rpg sh` |
| Quantas salas abertas | `curl http://SEU_IP:3001/health` |
| **Diagnosticar problema** | `bash deploy/diagnostico.sh` |

Todos rodando de dentro de `/opt/hub-rpg`.

---

## Atualizar depois de mexer no código

```bash
cd /opt/hub-rpg
bash deploy/atualizar-docker.sh
```

Ou na mão:

```bash
cd /opt/hub-rpg
git pull
docker compose up -d --build
```

As cenas já enviadas **não se perdem**: ficam num volume separado da imagem.

---

## O que tem dentro do container

Só o backend: `server.js`, a pasta `server/` e as dependências de produção.

O cliente (`src/`, `css/`, `index.html`) fica **de fora** de propósito. Além de
deixar a imagem pequena, evita publicar o código do app numa porta aberta para
a internet — o servidor serve arquivos estáticos do diretório onde roda, e não
há motivo para o seu código do cliente estar lá.

O Electron e o electron-builder também não entram: são só para empacotar o app
de desktop, e pesam centenas de MB.

O processo roda como usuário `node`, não root.

### Configuração

Tudo por variável de ambiente, no `docker-compose.yml`:

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | `3001` | Porta dentro do container |
| `SCENES_DIR` | `/dados/cenas` | Onde as cenas são gravadas (é o volume) |
| `SCENE_MAX_MB` | `150` | Teto de cada arquivo de cena |
| `SCENE_KEEP` | `30` | Quantas cenas guardar antes de podar as antigas |

Mudou algo? `docker compose up -d` aplica.

**Porta 3001 já ocupada na VPS?** Não precisa editar o compose — use o `.env`:

```bash
echo "HOST_PORT=3010" > .env
docker compose up -d
```

E use `http://SEU_IP:3010` no app. Tem um `.env.exemplo` na raiz do projeto com
as opções comentadas.

---

## Rodando junto com outros projetos

É para isso que serve o container. Cada projeto no seu, cada um com a sua
porta, e um não enxerga o outro:

```bash
/opt/hub-rpg/         docker compose up -d    → porta 3001
/opt/outro-projeto/   docker compose up -d    → porta 3002
```

O `container_name: hub-rpg` e o volume `cenas` são exclusivos deste projeto. Se
um dia você rodar duas instâncias do Hub-RPG na mesma VPS (uma de teste, por
exemplo), copie a pasta e mude no `docker-compose.yml`: o `container_name`, a
porta do lado esquerdo, e o nome do volume.

---

## Quando der problema

**`docker compose up` falha com "Cannot find module"**
→ Alguém acrescentou um arquivo que o servidor usa mas o `Dockerfile` não
copia. Abra o `Dockerfile`, veja os `COPY` e inclua o que falta.

**Container fica reiniciando**
→ `docker compose logs --tail 50` mostra o erro. Quase sempre é porta ocupada
(`EADDRINUSE`) ou dependência nova sem `--build`.

**Status fica `unhealthy`**
→ O processo subiu mas `/health` não responde. Veja os logs; se o log estiver
limpo, confira se você mudou `PORT` sem mudar o healthcheck.

**"O servidor não deu para alcançar" no app**
→ Quase sempre firewall. Teste em ordem:
```bash
curl http://localhost:3001/health      # de dentro da VPS
curl http://SEU_IP:3001/health         # do seu PC
```
Se o primeiro funciona e o segundo não, é firewall — revise o passo 4, os dois.

**Upload de cena falhando**
→ Permissão do volume. Confira:
```bash
docker compose exec hub-rpg ls -la /dados
```
Tem que aparecer `node node`. Se aparecer `root root`, o volume foi criado
antes do `chown` do Dockerfile — recrie: `docker compose down -v` **(atenção:
apaga as cenas já enviadas)** e suba de novo.

**Ver quanto o container está consumindo**
```bash
docker stats hub-rpg --no-stream
```

---

## Opcional: HTTPS

Hoje o tráfego vai sem criptografia. Para o app Electron funciona, mas chat e
fichas passam em texto puro.

Precisa de **um domínio** apontando para o IP. Com ele, acrescente o Caddy ao
`docker-compose.yml`:

```yaml
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
```

E em `deploy/Caddyfile`:

```
seudominio.com.br {
    reverse_proxy hub-rpg:3001
}
```

Acrescente `caddy_data:` na lista de `volumes:` do fim do arquivo, libere as
portas 80 e 443 no firewall, e use `https://seudominio.com.br` no app. O
certificado sai sozinho, e aí você pode até fechar a 3001.
