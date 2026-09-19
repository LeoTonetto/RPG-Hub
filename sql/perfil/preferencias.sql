-- ═══════════════════════════════════════════════════════════════════════════════
-- PREFERÊNCIAS DO JOGADOR — cor do cursor e opacidade do véu
--
-- Duas colunas novas em `profiles`. O app funciona sem elas: as preferências
-- ficam só no localStorage e não acompanham a conta em outra máquina. Rodando
-- este script, elas passam a viajar junto com o login.
--
-- Idempotente: pode rodar de novo sem problema.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.profiles
    add column if not exists cursor_color text,
    add column if not exists veu_opacidade real;

comment on column public.profiles.cursor_color is
    'Cor do cursor deste jogador, em hex (#rrggbb). Os outros jogadores veem o ponteiro nesta cor.';
comment on column public.profiles.veu_opacidade is
    'Opacidade do escurecido sobre a cena de fundo, de 0 (limpo) a 1 (padrão). Só afeta a tela deste jogador.';

-- Guarda-corpo: o app só manda hex válido e 0..1, mas o banco não custa garantir
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.profiles'::regclass
          and conname = 'profiles_cursor_color_hex'
    ) then
        alter table public.profiles
            add constraint profiles_cursor_color_hex
            check (cursor_color is null or cursor_color ~* '^#[0-9a-f]{6}$');
    end if;

    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.profiles'::regclass
          and conname = 'profiles_veu_opacidade_faixa'
    ) then
        alter table public.profiles
            add constraint profiles_veu_opacidade_faixa
            check (veu_opacidade is null or (veu_opacidade >= 0 and veu_opacidade <= 1));
    end if;
end $$;


-- ── Quem pode escrever nisto? ────────────────────────────────────────────────
-- Cada jogador precisa poder atualizar a PRÓPRIA linha de profiles. Se o seu
-- projeto ainda não tem essa policy, a gravação falha em silêncio no banco e o
-- app cai para o localStorage (ele avisa no painel quando isso acontece).
--
-- Confira o que existe hoje:
--     select policyname, cmd, qual from pg_policies
--     where schemaname = 'public' and tablename = 'profiles';
--
-- Se faltar a de UPDATE, esta resolve:
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'profiles'
          and cmd = 'UPDATE'
    ) then
        execute $pol$
            create policy profiles_atualiza_o_proprio on public.profiles
                for update to authenticated
                using (id = auth.uid())
                with check (id = auth.uid())
        $pol$;
        raise notice 'Policy de UPDATE criada em profiles.';
    else
        raise notice 'profiles já tem policy de UPDATE — nada a fazer.';
    end if;
end $$;


-- ── Conferência ──────────────────────────────────────────────────────────────
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('cursor_color', 'veu_opacidade');
-- Esperado: duas linhas (text e real).
