-- The first 1.4 migration stored HH:mm as varchar(5). The data model defines
-- local time columns as time, so cast in place instead of dropping data.
ALTER TABLE "availability_rule"
  DROP CONSTRAINT "availability_rule_time_format_check";

ALTER TABLE "availability_rule"
  ALTER COLUMN "start_time" TYPE TIME(0) USING "start_time"::time,
  ALTER COLUMN "end_time" TYPE TIME(0) USING "end_time"::time;
