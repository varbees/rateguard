package bootstrap

import (
	"fmt"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/pterm/pterm"
	"github.com/varbees/rateguard/config"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// GetEnvironment returns a human-readable environment name.
func GetEnvironment(isDevelopment bool) string {
	if isDevelopment {
		return "development"
	}
	return "production"
}

// PrintStartupBanner prints the RateGuard startup banner.
func PrintStartupBanner(version string) {
	pterm.Println()

	s, _ := pterm.DefaultBigText.WithLetters(
		pterm.NewLettersFromStringWithStyle("Rate", pterm.NewStyle(pterm.FgCyan)),
		pterm.NewLettersFromStringWithStyle("Guard", pterm.NewStyle(pterm.FgLightMagenta)),
	).Srender()

	pterm.DefaultCenter.Println(s)
	pterm.DefaultCenter.Println(pterm.LightCyan("The All-in-One API Gateway for AI Developers"))
	pterm.DefaultCenter.Println(pterm.Gray("v" + version))
	pterm.Println()
}

// PrintEnvironmentBadge displays the current environment with color coding.
func PrintEnvironmentBadge(env string) {
	var badge string
	if env == "production" {
		badge = pterm.BgGreen.Sprint(pterm.FgBlack.Sprint(" PRODUCTION "))
	} else {
		badge = pterm.BgYellow.Sprint(pterm.FgBlack.Sprint(" DEVELOPMENT "))
	}

	pterm.Info.Println("Environment:", badge)
	pterm.Println()
}

// RunMigrations executes database migrations (CLI command).
func RunMigrations(cfg *config.Config) {
	fmt.Println("🔄 Running database migrations...")

	if err := RunMigrationsAuto(cfg); err != nil {
		fmt.Fprintf(os.Stderr, "❌ Migration failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✅ Migrations completed successfully")
}

// RunMigrationsWithProgress runs database migrations with a progress indicator.
func RunMigrationsWithProgress(cfg *config.Config) error {
	spinner, _ := pterm.DefaultSpinner.Start("Running database migrations...")

	err := RunMigrationsAuto(cfg)
	if err != nil {
		spinner.Fail("Migration failed")
		return err
	}

	spinner.Success("Database schema is up-to-date")
	return nil
}

// RunMigrationsAuto executes database migrations and returns an error.
func RunMigrationsAuto(cfg *config.Config) error {
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=%s",
		cfg.Database.User,
		cfg.Database.Password,
		cfg.Database.Host,
		cfg.Database.Port,
		cfg.Database.Database,
		cfg.Database.SSLMode,
	)

	fmt.Printf("  → Connecting to: %s:%d/%s\n", cfg.Database.Host, cfg.Database.Port, cfg.Database.Database)

	m, err := migrate.New(
		"file://migrations",
		dsn,
	)
	if err != nil {
		return fmt.Errorf("failed to initialize migrations: %w", err)
	}
	defer m.Close()

	version, dirty, err := m.Version()
	if err == nil && dirty {
		fmt.Printf("  ⚠️  Database is in dirty state at version %d - attempting to recover...\n", version)
		if err := m.Force(int(version)); err != nil {
			return fmt.Errorf("failed to force version %d: %w", version, err)
		}
		fmt.Printf("  ✓ Forced version %d, retrying migrations...\n", version)
	}

	if err := m.Up(); err != nil {
		if err == migrate.ErrNoChange {
			fmt.Println("  → Database schema is already up-to-date")
			return nil
		}
		return fmt.Errorf("failed to apply migrations: %w", err)
	}

	version, dirty, err = m.Version()
	if err != nil {
		fmt.Println("  → Migrations applied (version check unavailable)")
	} else if dirty {
		return fmt.Errorf("database is in dirty state at version %d - manual intervention required", version)
	} else {
		fmt.Printf("  → Applied migrations successfully (current version: %d)\n", version)
	}

	return nil
}

// CustomErrorHandler handles Fiber errors with request-aware logging.
func CustomErrorHandler(c *fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	message := "Internal Server Error"

	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
		message = e.Message
	}

	requestID := c.Locals("requestid")
	if requestID == nil {
		requestID = "unknown"
	}

	logger.Error("Request error",
		zap.String("request_id", requestID.(string)),
		zap.String("method", c.Method()),
		zap.String("path", c.Path()),
		zap.Int("status_code", code),
		zap.String("error", message),
	)

	return c.Status(code).JSON(fiber.Map{
		"error":      message,
		"request_id": requestID,
		"timestamp":  time.Now(),
	})
}
