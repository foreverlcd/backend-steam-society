-- Non-admin accounts must have a birth date; only the admin seed may omit it.
ALTER TABLE "user" ADD CONSTRAINT "user_birth_date_required_check" CHECK ("role" = 'admin' OR "birth_date" IS NOT NULL);
