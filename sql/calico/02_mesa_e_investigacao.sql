-- ═══════════════════════════════════════════════════════════════════════════════
-- CALICO — 02. MESA, INVESTIGAÇÃO E ADVERSÁRIOS
--
-- Estas tabelas são para as PRÓXIMAS ETAPAS (itens P1/P2 da spec §12). O código
-- que escrevi agora ainda NÃO lê nenhuma delas — a ficha, a criação e o rolador
-- não dependem disto.
--
-- Rode agora se quiser já ir cadastrando conteúdo enquanto o painel do mestre
-- não existe (dá para preencher pelo Table Editor do Supabase). Ou guarde e rode
-- quando eu (ou você) for implementar o painel.
--
-- Cobre:
--   A) calico_mesa                → notoriedade e flags de config por sala
--   B) calico_notoriedade_log     → histórico de quando subiu e por quê
--   C) calico_cenas               → cenas de investigação
--   D) calico_pontos_interesse    → pontos de interesse e suas informações
--   E) calico_adversarios         → statblocks com regeneração por tipo de dano
--   F) calico_rolagens            → log de rolagens da sessão
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- A) Estado de mesa (spec §9 e §15)
--
-- Uma linha por sala. Carrega a trilha de Notoriedade do GRUPO e as flags de
-- configuração que a spec manda deixar expostas — elas espelham o objeto
-- CALICO_CONFIG em src/calico.js, para que você possa virar uma chave no meio da
-- campanha sem editar código.
-- ═══════════════════════════════════════════════════════════════════════════════
create table if not exists public.calico_mesa (
    room_code    text primary key,

    -- §9 — trilha do grupo, 0 a 4
    notoriedade  integer not null default 0 check (notoriedade between 0 and 4),

    -- §7.2 — modo de cena atual
    modo_cena    text not null default 'livre'
                 check (modo_cena in ('livre', 'rodadas', 'investigacao', 'combate')),

    sessao       integer not null default 1,

    -- ── Flags de config (spec §15). NULL = usa o padrão de src/calico.js ─────
    -- §7.5 — a campanha liga isto a partir da sessão 3
    critico_armas_fogo_x3   boolean,
    -- §7.2 — iniciativa rolada em vez do fluxo livre do playtest
    iniciativa_rolada       boolean,
    -- §8.3 — "tic/click/toc" em vez de "baixo/exato/alto"
    destrancar_imersao      boolean,
    -- §8.2 — 'pesquisar' (corpo do texto) ou 'intuicao' (tabela-resumo)
    compartilhar_pericia    text check (compartilhar_pericia in ('pesquisar', 'intuicao')),
    -- §1.4
    dt_padrao               integer,
    teto_passos             integer,

    updated_at   timestamptz not null default now(),
    created_at   timestamptz not null default now()
);

comment on table public.calico_mesa is
    'Estado de mesa do Calico, uma linha por sala. Separado da ficha do personagem (spec §11).';
comment on column public.calico_mesa.critico_armas_fogo_x3 is
    'NULL usa o padrão do código (false). true = armas de fogo multiplicam dano crítico por 3 (spec §7.5).';


-- ═══════════════════════════════════════════════════════════════════════════════
-- B) Histórico de notoriedade (spec §9)
-- "Precisa ser um contador visível no painel do mestre, com histórico de quando
--  subiu e por quê."
-- ═══════════════════════════════════════════════════════════════════════════════
create table if not exists public.calico_notoriedade_log (
    id          uuid primary key default gen_random_uuid(),
    room_code   text not null,
    delta       integer not null,
    valor_final integer not null,
    motivo      text not null,
    sessao      integer,
    created_at  timestamptz not null default now()
);

create index if not exists calico_notoriedade_log_sala_idx
    on public.calico_notoriedade_log (room_code, created_at desc);


-- ═══════════════════════════════════════════════════════════════════════════════
-- C) Cenas de investigação (spec §8)
-- ═══════════════════════════════════════════════════════════════════════════════
create table if not exists public.calico_cenas (
    id          uuid primary key default gen_random_uuid(),
    room_code   text not null,
    nome        text not null,
    resumo      text,
    ativa       boolean not null default false,
    ordem       integer not null default 0,
    created_at  timestamptz not null default now()
);

create index if not exists calico_cenas_sala_idx on public.calico_cenas (room_code, ordem);


-- ═══════════════════════════════════════════════════════════════════════════════
-- D) Pontos de interesse (spec §8.1)
--
-- `informacoes` e `desafio_acesso` ficam em jsonb porque são listas de formato
-- variável — mesma escolha que characters.stats já faz.
--
-- Formato de `informacoes` (array):
--   [ { "pericia": "percepcao", "dt": 6, "texto": "...",
--       "revelada": false, "condicao": "opcional" } ]
--
--   ATENÇÃO à regra da ação Investigar (spec §8.2): a DT aqui é comparada com o
--   VALOR DO DADO da perícia (4, 6, 8, 10, 12), não com uma rolagem. Uma info de
--   DT 8 é entregue de graça a quem tem a perícia em d8.
--
-- Formato de `desafio_acesso` (objeto, spec §8.3):
--   { "tipo": "destrancar",
--     "destrancar": { "numDados": 3, "senha": [4,1,6], "tentativasMax": 12 } }
--   { "tipo": "arrombar",
--     "arrombar": { "dt": 10, "pa": 20, "consequencia": "Faz barulho" } }
-- ═══════════════════════════════════════════════════════════════════════════════
create table if not exists public.calico_pontos_interesse (
    id                    uuid primary key default gen_random_uuid(),
    room_code             text not null,
    cena_id               uuid references public.calico_cenas(id) on delete cascade,

    nome                  text not null,
    -- Lida em voz alta para a mesa
    descricao_basica      text,
    -- Só o mestre vê: a verdade sobre o ponto de interesse
    descricao_contextual  text,
    -- Referência a imagem/arquivo (mesmo padrão de uso do bucket CharactersAndItems)
    handout               text,

    informacoes           jsonb not null default '[]'::jsonb,
    desafio_acesso        jsonb,

    ordem                 integer not null default 0,
    created_at            timestamptz not null default now(),

    constraint calico_pi_informacoes_array check (jsonb_typeof(informacoes) = 'array')
);

create index if not exists calico_pi_sala_idx on public.calico_pontos_interesse (room_code, ordem);
create index if not exists calico_pi_cena_idx on public.calico_pontos_interesse (cena_id);

comment on column public.calico_pontos_interesse.informacoes is
    'Array de { pericia, dt, texto, revelada, condicao? }. A DT é comparada com o VALOR DO DADO da perícia na ação Investigar (spec §8.2), não com uma rolagem.';


-- ═══════════════════════════════════════════════════════════════════════════════
-- E) Statblocks de adversários (spec §11)
--
-- O ponto crítico para o arco desta campanha: as criaturas regeneram dano
-- balístico, corte, perfuração e impacto, mas NÃO regeneram fogo. Por isso
-- `regeneracao` guarda a lista de exceções por tipo de dano.
--
-- Nomenclatura (spec §14): nada aqui usa a palavra "vampiro". Use "criatura",
-- "adversário" ou "Pálido".
-- ═══════════════════════════════════════════════════════════════════════════════
create table if not exists public.calico_adversarios (
    id           uuid primary key default gen_random_uuid(),
    -- NULL = disponível em qualquer sala (bestiário geral da campanha)
    room_code    text,

    nome         text not null,
    descricao    text,
    foto         text,

    pv           integer not null default 10,
    pd           integer,

    -- { "fisico": "d10", "mente": "d6", "emocao": "d8" }
    atributos    jsonb not null default '{}'::jsonb,
    -- { "luta": "d8", "furtividade": "d12", "percepcao": "d8" }
    pericias     jsonb not null default '{}'::jsonb,
    -- [ { "nome": "Investida", "teste": "fisico+luta", "dano": "RA+1", "tipo": "perfuracao" } ]
    ataques      jsonb not null default '[]'::jsonb,
    -- { "ativa": true, "excecoes": ["fogo"], "rodadas": 1 }
    regeneracao  jsonb,
    -- [ { "nome": "Olhar", "texto": "..." } ]
    tracos       jsonb not null default '[]'::jsonb,
    -- Tipos que a criatura resiste ou ignora, entre os de TIPOS_DANO em src/calico.js
    resistencias jsonb not null default '[]'::jsonb,
    imunidades   jsonb not null default '[]'::jsonb,

    created_at   timestamptz not null default now()
);

create index if not exists calico_adversarios_sala_idx on public.calico_adversarios (room_code);

comment on column public.calico_adversarios.regeneracao is
    'Ex.: {"ativa": true, "excecoes": ["fogo"], "rodadas": 1} — regenera tudo menos fogo (spec §7.5).';


-- ── Exemplo de statblock do arco (spec §11) ──────────────────────────────────
insert into public.calico_adversarios
    (nome, descricao, pv, atributos, pericias, ataques, regeneracao, tracos, resistencias)
select
    'Pálido recém-virado',
    'Era gente há poucos dias. Ainda tem o rosto de alguém que a cidade conhecia.',
    12,
    '{"fisico": "d10", "mente": "d6", "emocao": "d8"}'::jsonb,
    '{"luta": "d8", "furtividade": "d12", "percepcao": "d8"}'::jsonb,
    '[{"nome": "Investida", "teste": "fisico+luta", "dano": "RA+1", "tipo": "perfuracao"}]'::jsonb,
    '{"ativa": true, "excecoes": ["fogo"], "rodadas": 1}'::jsonb,
    '[{"nome": "Olhar", "texto": "Uma vez por cena, quem encarar faz EMOÇÃO + Disciplina DT 10 ou perde 2 PD"}]'::jsonb,
    '["balistico", "corte", "perfuracao", "impacto"]'::jsonb
where not exists (
    select 1 from public.calico_adversarios where nome = 'Pálido recém-virado'
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- F) Log de rolagens da sessão (spec §12, item P2 nº 13)
-- ═══════════════════════════════════════════════════════════════════════════════
create table if not exists public.calico_rolagens (
    id             uuid primary key default gen_random_uuid(),
    room_code      text not null,
    character_id   uuid references public.characters(id) on delete set null,
    personagem     text,

    atributo       text,
    pericia        text,
    -- [ { "dado": "d8", "valor": 5, "origem": "FÍSICO", "somado": true } ]
    dados          jsonb not null default '[]'::jsonb,
    soma           integer,
    ra             integer,
    rb             integer,
    dt             integer,
    sucesso        boolean,
    critico        boolean,
    falha_critica  boolean,
    -- Como a conta de passos foi montada, para auditar depois
    passos         jsonb,

    created_at     timestamptz not null default now()
);

create index if not exists calico_rolagens_sala_idx
    on public.calico_rolagens (room_code, created_at desc);


-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS — mesmo critério do script 01
-- ═══════════════════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
    foreach t in array array[
        'calico_mesa', 'calico_notoriedade_log', 'calico_cenas',
        'calico_pontos_interesse', 'calico_adversarios', 'calico_rolagens'
    ] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('drop policy if exists %I on public.%I', t || '_leitura', t);
        execute format(
            'create policy %I on public.%I for select to authenticated using (true)',
            t || '_leitura', t);
        execute format('drop policy if exists %I on public.%I', t || '_escrita', t);
        execute format(
            'create policy %I on public.%I for all to authenticated using (true) with check (true)',
            t || '_escrita', t);
    end loop;
end $$;

-- ATENÇÃO, uma decisão que é sua: `calico_pontos_interesse.descricao_contextual`
-- é "só o mestre vê" (spec §8.1), mas a política acima deixa qualquer jogador
-- logado ler a tabela inteira — ou seja, um jogador curioso consegue ver a
-- resposta pelo painel do Supabase ou pelo DevTools.
--
-- Enquanto o painel do mestre não existir, isso não vaza na interface. Quando
-- for implementar, escolha uma das saídas:
--   1. o cliente do mestre lê a coluna e distribui por socket (nenhum jogador
--      consulta essa tabela direto) — é o padrão que missions e npcs já seguem;
--   2. mover as colunas secretas para uma tabela à parte com política restrita a
--      profiles.role = 'master';
--   3. uma VIEW pública sem as colunas secretas, e revogar o select na tabela.
--
-- A opção 1 é a que combina com o resto do Hub-RPG e não exige papel no banco.


-- ═══════════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════════════════════════
select table_name
from information_schema.tables
where table_schema = 'public' and table_name like 'calico%'
order by table_name;
-- Esperado: calico_adversarios, calico_cenas, calico_mesa,
--           calico_notoriedade_log, calico_ocupacoes, calico_perfis,
--           calico_pontos_interesse, calico_rolagens
