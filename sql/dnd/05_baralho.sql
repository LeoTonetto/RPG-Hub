-- ══════════════════════════════════════════════════════════════════════════════
-- D&D 5e — Baralho das Surpresas (Guia do Mestre)
-- Rode uma vez no SQL Editor do Supabase. Pode rodar de novo sem problema.
--
-- Guarda, por mestre, quais cartas já saíram (elas não voltam ao baralho até
-- o mestre resetar). Cada mestre só lê e grava o próprio baralho.
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.dnd_baralhos (
    dono           uuid primary key default auth.uid(),
    puxadas        jsonb not null default '[]'::jsonb,   -- [{ id, quando, manual? }]
    atualizado_em  timestamptz not null default now()
);

alter table public.dnd_baralhos enable row level security;
drop policy if exists dnd_baralhos_dono on public.dnd_baralhos;
create policy dnd_baralhos_dono on public.dnd_baralhos for all to authenticated
    using (dono = auth.uid()) with check (dono = auth.uid());

-- Conferência: a tabela existe (deve dar 0 ou mais linhas, sem erro)
select count(*) as baralhos from public.dnd_baralhos;
