-- hd19_analysis_results — 6DOF 마운트 진동 해석 결과 저장
--
-- ⚠️ 대표가 Supabase SQL Editor에서 직접 실행해야 한다. 이 앱에는 anon 키만
--    있어 DDL을 실행할 권한이 없다 (CLAUDE.md §3.7).
-- ⚠️ 재실행해도 안전하게 IF NOT EXISTS / DROP POLICY IF EXISTS 를 앞세웠다.
--
-- ── 소유자 격리에 대한 솔직한 한계 ──────────────────────────────────────
-- 이 사이트에는 로그인이 없다. "내 기록"은 브라우저 localStorage에 저장한
-- 무작위 UUID(owner_id)로만 구분한다. 화면(js/store.js)은 그 UUID로
-- select .eq('owner_id', ...) 필터를 걸지만, RLS 정책 자체는 로그인 세션이
-- 없어 그 UUID가 "진짜 그 사람 것"인지 서버에서 검증할 방법이 없다.
-- 즉 anon 키를 아는 사람이 API를 직접 두드리면 다른 사람의 owner_id로도
-- 조회/삽입이 가능하다 — anon 키는 이 정적 사이트 번들에 그대로 노출돼 있으므로
-- 사실상 "누구나 접근 가능한 공유 메모장"에 가깝다.
-- 진짜 프라이버시가 필요해지면(민감한 설계 데이터가 쌓이기 시작하면) 로그인을
-- 추가하고 owner_id를 auth.uid() 기반으로 바꿔야 한다. 지금은 계산 조건·결과
-- 수치 정도라 이 수준으로 충분하다고 보고 만들었다 — 대표 판단으로 조정 가능.
-- ──────────────────────────────────────────────────────────────────

create table if not exists public.hd19_analysis_results (
  id          bigint generated always as identity primary key,
  owner_id    text not null,
  label       text not null,
  inputs      jsonb not null,
  results     jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists hd19_analysis_results_owner_idx
  on public.hd19_analysis_results (owner_id, created_at desc);

alter table public.hd19_analysis_results enable row level security;

drop policy if exists "hd19_insert_anyone" on public.hd19_analysis_results;
create policy "hd19_insert_anyone"
  on public.hd19_analysis_results
  for insert
  to anon
  with check (true);

drop policy if exists "hd19_select_anyone" on public.hd19_analysis_results;
create policy "hd19_select_anyone"
  on public.hd19_analysis_results
  for select
  to anon
  using (true);

-- 응시·제출 성격은 아니지만(§3.7의 "기록성 테이블에는 UPDATE/DELETE 정책을 두지
-- 않는다"와 같은 취지로) 수정/삭제 정책은 의도적으로 만들지 않는다 — 저장한
-- 기록은 그대로 남는다. 필요해지면 그때 정책을 추가한다.

revoke all on public.hd19_analysis_results from public;
grant select, insert on public.hd19_analysis_results to anon;
grant usage on sequence hd19_analysis_results_id_seq to anon;
