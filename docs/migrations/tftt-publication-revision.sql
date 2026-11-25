-- External torah-by-the-table project only. Returns a compact fingerprint, not rows.
create function public.tftt_publication_revision()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with published as materialized (
    select id, file_path, title, subtitle, parsha_key, jewish_year, week_of,
           created_at, publication_id, publication, summary_quick, summary_full,
           description, content_type, primary_category, tags, best_for,
           audience, format_type, page_count, badge, featured_slot, summary_audio_path
    from public.pdfs where published is true
  ), thumbs as (
    select o.name, o.updated_at, o.metadata->>'eTag' as etag
    from storage.objects o
    join published p on split_part(o.name, '.', 1) = p.id::text
    where o.bucket_id = 'pdf-thumbs'
      and (o.name ~ '^[a-f0-9-]{36}\.png$'
        or o.name ~ '^[a-f0-9-]{36}\.[a-f0-9]{32}\.small\.webp$')
  )
  select jsonb_build_object(
    'revision', md5(jsonb_build_array(
      (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb) from published p),
      (select coalesce(jsonb_agg(to_jsonb(t) order by t.name), '[]'::jsonb) from thumbs t),
      (select coalesce(jsonb_agg(jsonb_build_array(id, name, publisher, default_audience,
          default_format_type, default_description, sort_order, active) order by id), '[]'::jsonb)
          from public.publications),
      (select coalesce(jsonb_agg(jsonb_build_array(id, title, active, sort_order,
          publication_id) order by id), '[]'::jsonb) from public.checklist_sources)
    )::text),
    'published_count', (select count(*) from published)
  );
$$;
revoke all on function public.tftt_publication_revision() from public, anon, authenticated;
grant execute on function public.tftt_publication_revision() to service_role;
comment on function public.tftt_publication_revision() is
  'Server-only read-only catalogue/thumbnail fingerprint; no rows or private data returned.';
