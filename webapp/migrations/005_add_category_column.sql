-- Database migration to add category column to entities table.
ALTER TABLE entities ADD COLUMN category TEXT;

-- Update existing years
UPDATE entities SET category = 'topic' WHERE entity_type = 'year';

-- Update existing companies/labs
UPDATE entities SET category = 'organization' WHERE entity_type = 'company' OR group_name IN ('Labs', 'Companies', 'Platforms', 'Infrastructure', 'Capital');

-- Update existing job roles using keyword matching
UPDATE entities SET category = 'job_role' WHERE id LIKE 'job-role-%' 
  OR name LIKE '%job role%' OR name LIKE '%labor%' OR name LIKE '%career%' OR name LIKE '%salary%' OR name LIKE '%hiring%' OR name LIKE '%layoff%' OR name LIKE '%displacement%' OR name LIKE '%workforce%' OR name LIKE '%employment%'
  OR id LIKE '%job-role%' OR id LIKE '%labor%' OR id LIKE '%career%' OR id LIKE '%salary%' OR id LIKE '%hiring%' OR id LIKE '%layoff%' OR id LIKE '%displacement%' OR id LIKE '%workforce%' OR id LIKE '%employment%';

-- Update the remaining as topic
UPDATE entities SET category = 'topic' WHERE category IS NULL;
