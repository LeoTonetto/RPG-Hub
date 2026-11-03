-- ══════════════════════════════════════════════════════════════════════════════
-- D&D 5e — ITENS NO INVENTÁRIO E BOLSA DO GRUPO
--
-- Rode no SQL Editor do Supabase (pode rodar de novo, não duplica nada).
--
-- 1) O catálogo `items` ganha a coluna `sistema`: tudo o que já existe é do
--    Calico (era o único sistema) e o Inventário de uma sala só mostra os
--    itens do sistema dela. Item sem sistema aparece em todos.
-- 2) Os itens que os pacotes do Livro do Jogador dão (o que vem dentro de cada
--    pacote, LdJ p. 151, e o equipamento dos antecedentes). O app entrega ao
--    criar o personagem; armas e armaduras ficam nos painéis da ficha.
-- 3) A bolsa do grupo: o app do mestre guarda aqui o dinheiro da mesa entre
--    uma sessão e outra (uma linha por mestre).
--
-- Se `items.id` não tiver default (consulta 4 do sql/calico/00_diagnostico.sql),
-- rode antes:  alter table public.items alter column id set default gen_random_uuid();
-- ══════════════════════════════════════════════════════════════════════════════

-- 1) Sistema de cada item
alter table public.items add column if not exists sistema text;
update public.items set sistema = 'calico' where sistema is null;

-- 2) Itens do D&D (80)
insert into public.items (name, icon, viewable, sistema)
select v.name, v.icon, v.viewable, 'dnd'
from (values
    ('Alaúde', '🎵', false),
    ('Algibeira', '🎒', false),
    ('Aljava', '🎒', false),
    ('Amuleto da sorte', '💍', false),
    ('Anel de sinete', '💍', false),
    ('Armadilha de caça', '🪤', false),
    ('Baú', '🎒', false),
    ('Bloco de incenso', '✝', false),
    ('Bolsa de componentes', '🎒', false),
    ('Caixa de esmolas', '✝', false),
    ('Caixa de fogo', '🕯', false),
    ('Caneta tinteiro', '📜', false),
    ('Cantil', '🍞', false),
    ('Carta de apresentação da guilda', '📜', false),
    ('Carta de um colega falecido', '📜', false),
    ('Cobertor', '🧺', false),
    ('Cobertor de inverno', '🧺', false),
    ('Corda de cânhamo (15 m)', '🪢', false),
    ('Corda de seda (15 m)', '🪢', false),
    ('Dados de osso', '💍', false),
    ('Esferas de metal (saco com 1.000)', '💍', false),
    ('Estojo de pergaminho com notas', '🎒', false),
    ('Estojo para mapas ou pergaminhos', '🎒', false),
    ('Faca pequena', '🔪', false),
    ('Fantasia', '👘', false),
    ('Ferramentas de artesão', '🛠', false),
    ('Ferramentas de ladrão', '🛠', false),
    ('Ferramentas de trapaça', '🛠', false),
    ('Fetiche de um animal abatido', '💍', false),
    ('Flecha', '🏹', false),
    ('Foco arcano', '🔮', false),
    ('Foco druídico', '🔮', false),
    ('Folha de papel', '📜', false),
    ('Folha de pergaminho', '📜', false),
    ('Frasco de óleo', '🕯', false),
    ('Grimório', '🔮', false),
    ('Incensário', '✝', false),
    ('Insígnia de patente', '💍', false),
    ('Instrumento musical', '🎵', false),
    ('Kit de disfarce', '🛠', false),
    ('Kit de herbalismo', '🛠', false),
    ('Kit de refeição', '🍞', false),
    ('Lâmpada', '🕯', false),
    ('Lanterna coberta', '🕯', false),
    ('Lembrança dos pais', '💍', false),
    ('Linha (3 m)', '🪢', false),
    ('Livro de estudo', '📜', false),
    ('Livro de preces', '✝', false),
    ('Mapa da cidade natal', '📜', false),
    ('Martelo', '🛠', false),
    ('Mochila', '🎒', false),
    ('Pá', '🛠', false),
    ('Parafina', '🕯', false),
    ('Pé de cabra', '🛠', false),
    ('Pena', '📜', false),
    ('Pergaminho de linhagem', '🪢', false),
    ('Píton', '🛠', false),
    ('Pote de ferro', '🛠', false),
    ('Presente de um admirador', '💍', false),
    ('Ração (1 dia)', '🍞', false),
    ('Rato de estimação', '🐀', false),
    ('Roupas comuns', '👘', false),
    ('Roupas de viajante', '👘', false),
    ('Roupas escuras com capuz', '👘', false),
    ('Roupas finas', '👘', false),
    ('Sabão', '🧺', false),
    ('Saco de dormir', '🎒', false),
    ('Saquinho de areia', '📜', false),
    ('Símbolo sagrado', '✝', false),
    ('Sino', '💍', false),
    ('Tocha', '🕯', false),
    ('Traje', '👘', false),
    ('Troféu de um inimigo caído', '💍', false),
    ('Vareta de incenso', '✝', false),
    ('Vela', '🕯', false),
    ('Vestes', '✝', false),
    ('Vestimentas', '👘', false),
    ('Vidro de perfume', '💍', false),
    ('Vidro de tinta', '📜', false),
    ('Virote', '🏹', false)
) as v(name, icon, viewable)
where not exists (
    select 1 from public.items i where i.name = v.name and i.sistema = 'dnd'
);

-- 3) Bolsa do grupo
create table if not exists public.dnd_bolsas (
    dono           uuid primary key default auth.uid(),
    moedas         jsonb not null default '{}'::jsonb,   -- { pc, pp, pe, po, pl }
    historico      jsonb not null default '[]'::jsonb,   -- últimas mudanças
    atualizado_em  timestamptz not null default now()
);
alter table public.dnd_bolsas enable row level security;
drop policy if exists dnd_bolsas_dono on public.dnd_bolsas;
create policy dnd_bolsas_dono on public.dnd_bolsas for all to authenticated
    using (dono = auth.uid()) with check (dono = auth.uid());

-- Conferência
select (select count(*) from public.items where sistema = 'dnd') as itens_dnd,
       (select count(*) from public.items where sistema = 'calico') as itens_calico;
