-- Fleet reset follow-up (2026-11-15, Devon), applied to the FA/Axis CRM database.
-- 1) After a reset, MillPulse re-sent older reports still stored on the PC, so the
--    "fresh" graph filled back up. This trigger turns away exact copies of archived
--    (pre-reset) reports, except the newest one, which starts the fresh graph.
--    Genuinely new reports (different values) always get in, even with a low count.
-- 2) undo_machine_reset: mark restored BEFORE re-inserting (so the trigger lets the
--    old rows back in) and use OVERRIDING SYSTEM VALUE (id is GENERATED ALWAYS —
--    the original Undo would have failed on a real machine).

create or replace function public.block_resent_after_reset() returns trigger
language plpgsql security definer set search_path = public as $$
declare top_cc numeric; n jsonb := to_jsonb(new);
begin
  if new.serial is null or new.correction_count is null then return new; end if;
  select max((row_data->>'correction_count')::numeric) into top_cc
    from mill_history_archive where serial = new.serial and restored_at is null and source = tg_table_name;
  if top_cc is null or new.correction_count >= top_cc then return new; end if;
  if tg_table_name = 'mill_reports' then
    if exists (select 1 from mill_history_archive a
        where a.serial = new.serial and a.restored_at is null and a.source = 'mill_reports'
          and (a.row_data->>'correction_count')::numeric = new.correction_count
          and (a.row_data->'spindle_gradient_x') is not distinct from (n->'spindle_gradient_x')
          and (a.row_data->'spindle_gradient_y') is not distinct from (n->'spindle_gradient_y')
          and (a.row_data->'a_y_gap') is not distinct from (n->'a_y_gap')
          and (a.row_data->'b_x_gap') is not distinct from (n->'b_x_gap')
          and (a.row_data->'base_tool_length') is not distinct from (n->'base_tool_length')) then
      return null;
    end if;
  else
    if exists (select 1 from mill_history_archive a
        where a.serial = new.serial and a.restored_at is null and a.source = 'diagnostic_reports'
          and (a.row_data->>'correction_count')::numeric = new.correction_count
          and (a.row_data->'raw_text') is not distinct from (n->'raw_text')) then
      return null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists block_resent_after_reset on public.mill_reports;
create trigger block_resent_after_reset before insert on public.mill_reports
  for each row execute function public.block_resent_after_reset();
drop trigger if exists block_resent_after_reset on public.diagnostic_reports;
create trigger block_resent_after_reset before insert on public.diagnostic_reports
  for each row execute function public.block_resent_after_reset();

create or replace function public.undo_machine_reset(p_serial text)
returns json language plpgsql security definer set search_path = public as $$
declare rid uuid; n1 int; n2 int;
begin
  select reset_id into rid from mill_history_archive
   where serial = p_serial and restored_at is null order by archived_at desc limit 1;
  if rid is null then return json_build_object('restored', 0); end if;
  update mill_history_archive set restored_at = now() where reset_id = rid;
  insert into mill_reports overriding system value
    select (jsonb_populate_record(null::mill_reports, row_data)).*
    from mill_history_archive where reset_id = rid and source = 'mill_reports'
    on conflict do nothing;
  get diagnostics n1 = row_count;
  insert into diagnostic_reports overriding system value
    select (jsonb_populate_record(null::diagnostic_reports, row_data)).*
    from mill_history_archive where reset_id = rid and source = 'diagnostic_reports'
    on conflict do nothing;
  get diagnostics n2 = row_count;
  return json_build_object('restored', n1 + n2);
end $$;
