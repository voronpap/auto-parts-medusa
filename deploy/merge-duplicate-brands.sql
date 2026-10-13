\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE pair AS
SELECT d.id AS dup_id, d.name AS dup_name, d.normalized_name AS dup_norm, k.id AS keep_id
FROM (VALUES ('Škoda', 'SKODA'), ('Volkswagen', 'VW')) AS v(dup, keep)
JOIN parts_brand d ON d.name = v.dup AND d.deleted_at IS NULL
JOIN parts_brand k ON k.name = v.keep AND k.deleted_at IS NULL;

-- Numbers that exist under both brands: old -> the one that stays.
CREATE TEMP TABLE m AS
SELECT p.id AS old_id, q.id AS new_id
FROM part_number p
JOIN pair ON pair.dup_id = p.brand_id
JOIN part_number q ON q.brand_id = pair.keep_id AND q.number_type = p.number_type
  AND q.normalized_number = p.normalized_number AND q.deleted_at IS NULL
WHERE p.deleted_at IS NULL;

-- Numbers only the duplicate brand has simply change brand.
UPDATE part_number p SET brand_id = pair.keep_id, updated_at = now()
FROM pair WHERE p.brand_id = pair.dup_id AND p.deleted_at IS NULL
  AND p.id NOT IN (SELECT old_id FROM m);

CREATE TEMP TABLE r AS
SELECT pr.id, COALESCE(mf.new_id, pr.from_part_number_id) AS nf,
       COALESCE(mt.new_id, pr.to_part_number_id) AS nt, pr.relation_type
FROM part_relationship pr
LEFT JOIN m mf ON mf.old_id = pr.from_part_number_id
LEFT JOIN m mt ON mt.old_id = pr.to_part_number_id
WHERE pr.deleted_at IS NULL AND (mf.old_id IS NOT NULL OR mt.old_id IS NOT NULL);

-- Relationships that already exist on the staying number.
CREATE TEMP TABLE d AS
SELECT DISTINCT ON (r.id) r.id AS dup_rel, e.id AS keep_rel
FROM r JOIN part_relationship e ON e.from_part_number_id = r.nf
  AND e.to_part_number_id IS NOT DISTINCT FROM r.nt
  AND e.relation_type = r.relation_type AND e.deleted_at IS NULL AND e.id <> r.id
ORDER BY r.id, e.created_at;

UPDATE part_relationship_evidence ev SET relationship_id = d.keep_rel, updated_at = now()
FROM d WHERE ev.relationship_id = d.dup_rel AND ev.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM part_relationship_evidence x
                  WHERE x.relationship_id = d.keep_rel AND x.observation_id = ev.observation_id AND x.deleted_at IS NULL);
UPDATE part_relationship_evidence ev SET deleted_at = now()
FROM d WHERE ev.relationship_id = d.dup_rel AND ev.deleted_at IS NULL;
UPDATE part_relationship pr SET deleted_at = now() FROM d WHERE pr.id = d.dup_rel;

UPDATE part_relationship pr SET from_part_number_id = r.nf, to_part_number_id = r.nt, updated_at = now()
FROM r WHERE pr.id = r.id AND pr.id NOT IN (SELECT dup_rel FROM d);

UPDATE part_application a SET part_number_id = m.new_id, updated_at = now() FROM m WHERE a.part_number_id = m.old_id AND a.deleted_at IS NULL;
UPDATE part_attribute a SET part_number_id = m.new_id, updated_at = now() FROM m WHERE a.part_number_id = m.old_id AND a.deleted_at IS NULL;
UPDATE part_lookup_task t SET part_number_id = m.new_id, updated_at = now() FROM m WHERE t.part_number_id = m.old_id AND t.deleted_at IS NULL;
UPDATE part_number_search_key k SET deleted_at = now() FROM m WHERE k.part_number_id = m.old_id AND k.deleted_at IS NULL;
UPDATE product_product_variant_partscatalog_part_number l SET part_number_id = m.new_id, updated_at = now()
FROM m WHERE l.part_number_id = m.old_id AND l.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM product_product_variant_partscatalog_part_number x
                  WHERE x.product_variant_id = l.product_variant_id AND x.part_number_id = m.new_id);
UPDATE part_number p SET deleted_at = now() FROM m WHERE p.id = m.old_id;

-- The duplicate's name becomes an alias, so sources that use it keep matching.
INSERT INTO parts_brand_alias (id, alias, normalized_alias, brand_id)
SELECT 'pbalias_' || upper(substr(md5(random()::text || pair.dup_id), 1, 26)), pair.dup_name, pair.dup_norm, pair.keep_id
FROM pair
WHERE NOT EXISTS (SELECT 1 FROM parts_brand_alias a WHERE a.normalized_alias = pair.dup_norm AND a.deleted_at IS NULL);
UPDATE parts_brand b SET deleted_at = now() FROM pair WHERE b.id = pair.dup_id;

SELECT 'pairs', count(*) FROM pair UNION ALL SELECT 'numbers merged', count(*) FROM m
UNION ALL SELECT 'relationships touched', count(*) FROM r UNION ALL SELECT 'duplicate relationships folded', count(*) FROM d
UNION ALL SELECT 'self relations', count(*) FROM part_relationship WHERE deleted_at IS NULL AND from_part_number_id = to_part_number_id
UNION ALL SELECT 'relations to deleted numbers', count(*) FROM part_relationship pr JOIN part_number p ON p.id IN (pr.from_part_number_id, pr.to_part_number_id) WHERE pr.deleted_at IS NULL AND p.deleted_at IS NOT NULL
UNION ALL SELECT 'live relationships', count(*) FROM part_relationship WHERE deleted_at IS NULL;
COMMIT;
