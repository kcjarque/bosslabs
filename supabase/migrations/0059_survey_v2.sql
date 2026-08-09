-- Survey v2 (English, expanded — replaces the Taglish 4-question form).
-- Adds three columns to survey_responses:
--   q1_freetext   — elaboration when Q1 industry = 'other'
--   team_size     — Q3 (solo | micro | small | mid)
--   tried_before  — Q4 (never | abandoned | manual_system | has_software)
-- Existing columns keep their names but shift meaning in the new form:
--   q3_freetext   — now Q5 "first process you'd want to automate" (free text)
--   q4_intent     — now Q6 build intent (diy | diy_open | dfy)
-- All value lists stay plain text (no CHECK) — the form + lib/survey.ts enforce
-- the enums; this keeps old rows valid and new values (construction, healthcare,
-- inventory, payments_collections, diy_open, …) insertable without a constraint change.
alter table public.survey_responses
  add column if not exists q1_freetext text,
  add column if not exists team_size text,
  add column if not exists tried_before text;
