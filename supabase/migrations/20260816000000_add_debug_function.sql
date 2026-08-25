-- Create a safe function for debugging
CREATE OR REPLACE FUNCTION dev_execute_sql(query text)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  EXECUTE 'SELECT json_agg(t) FROM (' || query || ') t' INTO result;
  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
