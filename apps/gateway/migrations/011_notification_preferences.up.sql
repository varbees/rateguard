-- Create notification_preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_alerts BOOLEAN NOT NULL DEFAULT true,
    usage_threshold_percent INTEGER NOT NULL DEFAULT 80 CHECK (usage_threshold_percent >= 0 AND usage_threshold_percent <= 100),
    error_alerts BOOLEAN NOT NULL DEFAULT true,
    weekly_report BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_preferences(user_id);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_notification_preferences_updated_at();

-- Add comments
COMMENT ON TABLE notification_preferences IS 'User notification preferences for alerts and reports';
COMMENT ON COLUMN notification_preferences.usage_threshold_percent IS 'Alert when usage reaches this percentage (0-100)';
