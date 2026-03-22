-- Drop notification_preferences table
DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON notification_preferences;
DROP FUNCTION IF EXISTS update_notification_preferences_updated_at();
DROP TABLE IF EXISTS notification_preferences;
