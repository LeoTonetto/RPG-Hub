# Colocar o Hub-RPG na VPS da Hostinger

Guia do começo ao fim. São uns 20 minutos, quase tudo copiar e colar.

O mesmo servidor que hoje roda dentro do seu app agora também roda sozinho na
VPS. Você não perde o ngrok: na tela de criar sala aparece a escolha entre os
dois, e dá para alternar quando quiser.

---

## Antes de começar

Anote o **IP da sua VPS** — aparece no painel da Hostinger (hPanel → VPS →
Visão geral). Vai ser algo como `82.25.104.17`. Toda vez que este guia escrever
`SEU_IP`, troque por ele.

Escolha **Ubuntu 22.04** ou **24.04** ao instalar o sistema operacional, se a
Hostinger ainda perguntar. O guia assume Ubuntu.

---

## 1. Entrar na VPS

No Windows, abra o PowerShell e:

```bash
ssh root@SEU_IP
```

Ele pede a senha que a Hostinger te mostrou (ou que você definiu). Se reclamar
de "host key", digite `yes`.

---

## 2. Instalar o Node

O Ubuntu vem com uma versão velha demais. Instale a 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git
node -v
```

Tem que aparecer `v20.x.x`.

---

## 3. Baixar o projeto

```bash
mkdir -p /opt
cd /opt
git clone https://github.com/LeoTonetto/RPG-Hub.git hub-rpg
cd hub-rpg
npm ci --omit=dev
```

O `--omit=dev` é importante: pula o Electron e o electron-builder, que pesam
centenas de MB e não servem para nada no servidor. Só entram express,
socket.io e supabase-js.

> **Repositório privado?** O `git clone` vai pedir usuário e senha, e o GitHub
> não aceita mais senha comum. Gere um Personal Access Token em
> github.com → Settings → Developer settings → Tokens, e use o token no lugar
> da senha.

---

## 4. Testar na unha antes de automatizar

```bash
npm run server
```

Deve sair algo assim:

```
  Hub-RPG no ar na porta 3001
  Saúde: http://localhost:3001/health
```

Em outro terminal (ou com `Ctrl+C` e depois de novo), confira:

```bash
curl http://localhost:3001/health
```

Se voltar `{"ok":true,...}`, o servidor está funcionando. Derrube com `Ctrl+C` —
o próximo passo faz ele subir sozinho.

---

## 5. Deixar rodando pra sempre (systemd)

Sem isto, o servidor morre quando você fecha o SSH.

```bash
cat > /etc/systemd/system/hub-rpg.service <<'EOF'
[Unit]
Description=Hub-RPG — servidor de salas
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/hub-rpg
ExecStart=/usr/bin/node server/standalone.js
Restart=always
RestartSec=5
User=root

Environment=NODE_ENV=production
Environment=PORT=3001
Environment=SCENES_DIR=/var/lib/hub-rpg/cenas
Environment=SCENE_MAX_MB=150
Environment=SCENE_KEEP=30

StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

mkdir -p /var/lib/hub-rpg/cenas
systemctl daemon-reload
systemctl enable --now hub-rpg
systemctl status hub-rpg --no-pager
```

Tem que aparecer **active (running)** em verde.

Comandos do dia a dia:

| Para quê | Comando |
|---|---|
| Ver os logs ao vivo | `journalctl -u hub-rpg -f` |
| Reiniciar | `systemctl restart hub-rpg` |
| Parar | `systemctl stop hub-rpg` |
| Ver se está de pé | `systemctl status hub-rpg` |

---

## 6. Abrir a porta 3001

São **dois** firewalls, e esquecer o segundo é o erro mais comum.

**a) Firewall do Ubuntu:**

```bash
ufw allow 22/tcp
ufw allow 3001/tcp
ufw --force enable
ufw status
```

> Libere a 22 **antes** de ligar o ufw, senão você se tranca para fora do
> próprio servidor.

**b) Firewall da Hostinger:** no hPanel → VPS → Firewall, crie uma regra
aceitando **TCP porta 3001** de qualquer origem. Se o painel não tiver nenhum
firewall ativo, não precisa mexer.

**Confirme do seu PC**, no PowerShell:

```bash
curl http://SEU_IP:3001/health
```

Se voltar o JSON, acabou a parte do servidor. Se travar, é firewall — revise
os dois.

---

## 7. Configurar o app

No Hub-RPG, na tela de criar sala:

1. Em **Onde hospedar a sala**, clique em **🖥 Servidor**.
2. No campo que aparece, digite `http://SEU_IP:3001` e aperte Tab.
3. Deve aparecer **"Servidor no ar"** em verde logo abaixo.
4. **Criar Sala**.

O código de 6 letras é copiado automaticamente. **Seus jogadores entram só com
o código** — não precisa mandar URL nenhuma, porque o endereço agora é fixo.

A escolha fica gravada: das próximas vezes já abre no modo Servidor.

Para voltar ao ngrok é só clicar em **🔗 ngrok** antes de criar a sala.

---

## 8. Atualizar depois de mexer no código

Toda vez que você mudar algo em `server/` e subir para o GitHub:

```bash
cd /opt/hub-rpg
git pull
npm ci --omit=dev
systemctl restart hub-rpg
```

O app dos jogadores não precisa de nada — a não ser que a mudança tenha sido no
cliente, aí é build novo do Electron como sempre.

---

## O que mudou no jogo

**O mestre agora é o dono da sala, não "quem chegou primeiro".** Ao criar, o seu
app recebe um token e o guarda. É ele que prova quem você é a cada conexão.

Isso conserta duas coisas:

- Nenhum jogador vira mestre por conectar antes de você.
- **Você pode cair e voltar sem perder o posto.** Antes, se o seu Wi-Fi
  piscasse, o mestre sumia da sala e ninguém mais conseguia comandar nada — o
  jeito era todo mundo sair e recriar.

A sala também continua de pé mesmo com o seu app fechado. Os jogadores só perdem
a conexão se o servidor cair.

**Salas abandonadas** são recicladas depois de 12 horas sem ninguém dentro, para
os códigos poderem ser reusados.

---

## Quando der problema

**"O servidor não deu para alcançar"** no app
→ Firewall. Teste `curl http://SEU_IP:3001/health` do seu PC. Se falhar, revise
o passo 6 — inclusive o firewall do painel da Hostinger.

**"Este código já está em uso por outra mesa"**
→ O código sorteado colidiu com uma sala ainda registrada. Clique em Criar Sala
de novo; ele sorteia outro.

**Entrei como jogador na minha própria sala**
→ O token se perdeu (trocou de PC, limpou dados do app). Crie a sala de novo:
você vira dono do código novo.

**Servidor não sobe depois de um `git pull`**
→ `journalctl -u hub-rpg -n 50 --no-pager` mostra o erro. Quase sempre é
dependência nova: rode `npm ci --omit=dev` e reinicie.

**Ver quantas salas estão abertas**
→ `curl http://SEU_IP:3001/health` de qualquer lugar.

---

## Opcional: HTTPS

Hoje o tráfego vai sem criptografia. Para o app Electron isso funciona sem
problema, mas o conteúdo (chat, fichas) passa em texto puro pela internet.

Para criptografar você precisa de **um domínio** apontando para o IP. Com ele:

```bash
apt-get install -y caddy
cat > /etc/caddy/Caddyfile <<'EOF'
seudominio.com.br {
    reverse_proxy localhost:3001
}
EOF
systemctl restart caddy
ufw allow 80/tcp && ufw allow 443/tcp
```

O Caddy tira o certificado sozinho. Depois é só usar
`https://seudominio.com.br` no app em vez de `http://SEU_IP:3001`, e você pode
até fechar a 3001 no firewall.

---

## Sobre banda

A VPS resolve a franquia do ngrok, mas vale saber onde o tráfego é gasto, porque
os dois maiores consumidores continuam existindo:

1. **O cursor de cada jogador.** O app manda a posição do mouse a cada evento,
   sem throttle, e o servidor repassa para todos. É o maior gasto de longe.
2. **Os vídeos de fundo.** Cada jogador baixa o arquivo inteiro a cada troca de
   cena. Um vídeo de 30 MB com 5 jogadores são 150 MB de uma vez.

Nenhum dos dois é problema com a banda de uma VPS. Mas se um dia você voltar
para o ngrok, são esses dois que estouram a franquia — e os dois têm conserto
barato.
