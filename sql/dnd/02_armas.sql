-- ══════════════════════════════════════════════════════════════════════════════
-- D&D 5e — ARMAS DA MESA
--
-- Rode no SQL Editor do Supabase (pode rodar de novo, não apaga nada).
--
-- As 37 armas do Livro do Jogador ficam no próprio app. Aqui entram as armas
-- da mesa: uma espada longa +1, um machado que causa 1d6 de fogo a mais. O
-- mestre cadastra pelo app, no painel de armas da ficha ("Guardar no catálogo
-- da mesa"); quem cadastrou pode apagar ou desativar (ativo = false) no
-- Table Editor.
--
-- Toda arma da mesa parte de uma arma do livro (coluna base), de onde vêm as
-- propriedades (acuidade, leve, duas mãos...). O personagem guarda uma cópia
-- da arma na própria ficha: mexer aqui não muda armas já entregues.
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.dnd_armas (
    id          text primary key,
    nome        text not null,
    base        text not null,          -- id da arma do livro: 'espada-longa', 'arco-curto'...
    bonus       smallint not null default 0 check (bonus between -5 and 5),   -- +1 no ataque e no dano
    dano        text,                   -- troca o dado da base: '2d6'
    tipo_dano   text,                   -- troca o tipo da base: 'fogo'
    dano_extra  text,                   -- dano a mais em todo acerto: '1d6 fogo'
    nota        text,
    criado_por  uuid default auth.uid(),
    ativo       boolean not null default true,
    criado_em   timestamptz not null default now()
);

alter table public.dnd_armas enable row level security;
drop policy if exists dnd_armas_leitura on public.dnd_armas;
drop policy if exists dnd_armas_cadastro on public.dnd_armas;
drop policy if exists dnd_armas_edicao on public.dnd_armas;
drop policy if exists dnd_armas_remocao on public.dnd_armas;
create policy dnd_armas_leitura on public.dnd_armas for select to authenticated using (true);
create policy dnd_armas_cadastro on public.dnd_armas for insert to authenticated with check (criado_por = auth.uid());
create policy dnd_armas_edicao on public.dnd_armas for update to authenticated using (criado_por = auth.uid());
create policy dnd_armas_remocao on public.dnd_armas for delete to authenticated using (criado_por = auth.uid());

-- Conferência
select count(*) as armas_da_mesa from public.dnd_armas;
