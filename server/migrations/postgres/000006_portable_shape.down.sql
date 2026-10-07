-- Reverse of 000006: back to TEXT[] arrays and the updated_at triggers.
CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER apps_updated_at
    BEFORE UPDATE ON app.apps
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER records_updated_at
    BEFORE UPDATE ON app.records
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.apps
    ALTER COLUMN tags DROP DEFAULT,
    ALTER COLUMN tags TYPE TEXT[] USING ARRAY(SELECT jsonb_array_elements_text(tags)),
    ALTER COLUMN tags SET DEFAULT '{}';

ALTER TABLE app.apps
    ALTER COLUMN shared_types DROP DEFAULT,
    ALTER COLUMN shared_types TYPE TEXT[] USING ARRAY(SELECT jsonb_array_elements_text(shared_types)),
    ALTER COLUMN shared_types SET DEFAULT '{}';
