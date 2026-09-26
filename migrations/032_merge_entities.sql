-- Step 32: merge duplicate authors / tags from the portal.
--
-- merge_authors(keep, merge[]) and merge_tags(keep, merge[]) fold one or more
-- duplicates into a surviving row in a single transaction: every link
-- (records, journals, followers, subjects) moves to the survivor, empty
-- profile fields on the survivor are filled from the duplicates, and the
-- duplicates are deleted. Returns the number of records now linked to the
-- survivor.
--
-- records.authors (the free-text byline) is left alone: it is what the
-- article printed, not the link table.
--
-- Service role only: the portal calls these from its API after checking that
-- the user is an editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.merge_authors(p_keep bigint, p_merge bigint[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merge bigint[] := array_remove(p_merge, p_keep);
  v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM authors WHERE id = p_keep) THEN
    RAISE EXCEPTION 'author % does not exist', p_keep USING ERRCODE = 'P0002';
  END IF;
  IF coalesce(array_length(v_merge, 1), 0) = 0 THEN
    RAISE EXCEPTION 'nothing to merge' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM authors WHERE id = ANY (v_merge)) <> array_length(v_merge, 1) THEN
    RAISE EXCEPTION 'some authors to merge do not exist' USING ERRCODE = 'P0002';
  END IF;

  UPDATE authors keep
  SET description = coalesce(keep.description, src.description),
      cover_url   = coalesce(keep.cover_url, src.cover_url),
      national    = coalesce(keep.national, src.national),
      designation = coalesce(keep.designation, src.designation),
      short_name  = coalesce(keep.short_name, src.short_name)
  FROM (
    SELECT (array_agg(description) FILTER (WHERE description IS NOT NULL))[1] AS description,
           (array_agg(cover_url)   FILTER (WHERE cover_url   IS NOT NULL))[1] AS cover_url,
           (array_agg(national)    FILTER (WHERE national    IS NOT NULL))[1] AS national,
           (array_agg(designation) FILTER (WHERE designation IS NOT NULL))[1] AS designation,
           (array_agg(short_name)  FILTER (WHERE short_name  IS NOT NULL))[1] AS short_name
    FROM authors WHERE id = ANY (v_merge)
  ) src
  WHERE keep.id = p_keep;

  INSERT INTO record_authors (record_id, author_id)
  SELECT record_id, p_keep FROM record_authors WHERE author_id = ANY (v_merge)
  ON CONFLICT DO NOTHING;
  INSERT INTO magazine_authors (magazine_id, author_id)
  SELECT magazine_id, p_keep FROM magazine_authors WHERE author_id = ANY (v_merge)
  ON CONFLICT DO NOTHING;
  INSERT INTO followed_authors (user_id, author_id, name, created_at)
  SELECT fa.user_id, p_keep, k.name, fa.created_at
  FROM followed_authors fa CROSS JOIN (SELECT name FROM authors WHERE id = p_keep) k
  WHERE fa.author_id = ANY (v_merge)
  ON CONFLICT DO NOTHING;
  DELETE FROM followed_authors WHERE author_id = ANY (v_merge);

  -- record_authors / magazine_authors rows of the duplicates cascade.
  DELETE FROM authors WHERE id = ANY (v_merge);

  SELECT count(*) INTO v_count FROM record_authors WHERE author_id = p_keep;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_tags(p_keep integer, p_merge integer[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merge integer[] := array_remove(p_merge, p_keep);
  v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tags WHERE id = p_keep) THEN
    RAISE EXCEPTION 'tag % does not exist', p_keep USING ERRCODE = 'P0002';
  END IF;
  IF coalesce(array_length(v_merge, 1), 0) = 0 THEN
    RAISE EXCEPTION 'nothing to merge' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM tags WHERE id = ANY (v_merge)) <> array_length(v_merge, 1) THEN
    RAISE EXCEPTION 'some tags to merge do not exist' USING ERRCODE = 'P0002';
  END IF;

  UPDATE tags SET important = true
  WHERE id = p_keep AND EXISTS (SELECT 1 FROM tags WHERE id = ANY (v_merge) AND important);

  INSERT INTO record_tags (record_id, tag_id)
  SELECT record_id, p_keep FROM record_tags WHERE tag_id = ANY (v_merge)
  ON CONFLICT DO NOTHING;
  INSERT INTO tag_subsubjects (tag_id, subsubject_id)
  SELECT p_keep, subsubject_id FROM tag_subsubjects WHERE tag_id = ANY (v_merge)
  ON CONFLICT DO NOTHING;
  -- subjects_tags has no (subject, tag) unique key, so skip pairs already present.
  INSERT INTO subjects_tags (subject_id, tag_id)
  SELECT DISTINCT st.subject_id, p_keep FROM subjects_tags st
  WHERE st.tag_id = ANY (v_merge)
    AND NOT EXISTS (SELECT 1 FROM subjects_tags x WHERE x.tag_id = p_keep AND x.subject_id IS NOT DISTINCT FROM st.subject_id);

  DELETE FROM tags WHERE id = ANY (v_merge);

  SELECT count(*) INTO v_count FROM record_tags WHERE tag_id = p_keep;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_authors(bigint, bigint[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merge_tags(integer, integer[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_authors(bigint, bigint[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_tags(integer, integer[]) TO service_role;

COMMIT;
