package main

import (
	"os"

	"github.com/joho/godotenv"
	"github.com/pterm/pterm"
	"github.com/varbees/rateguard/config"
	bootstrap "github.com/varbees/rateguard/internal/app/bootstrap"
	appruntime "github.com/varbees/rateguard/internal/app/runtime"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

const AppVersion = "2.1.0-optimized"

func main() {
	bootstrap.PrintStartupBanner(AppVersion)

	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		pterm.Warning.Printf("Error loading .env file: %v\n", err)
	}

	cfg, err := config.Load("")
	if err != nil {
		pterm.Error.Printf("Failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	env := bootstrap.GetEnvironment(cfg.Logging.Development)
	bootstrap.PrintEnvironmentBadge(env)

	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		bootstrap.RunMigrations(cfg)
		return
	}

	if err := bootstrap.RunMigrationsWithProgress(cfg); err != nil {
		pterm.Error.Printf("Migration failed: %v\n", err)
		pterm.Warning.Println("⚠️  Please check your database connection and migration files")
		os.Exit(1)
	}

	logConfig := logger.Config{
		Level:       cfg.Logging.Level,
		Format:      cfg.Logging.Format,
		Development: cfg.Logging.Development,
	}
	if err := logger.Initialize(logConfig); err != nil {
		pterm.Error.Printf("Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	logger.Info("🚀 Starting RateGuard - The All-in-One API Gateway for AI Developers",
		zap.String("version", AppVersion),
		zap.String("environment", bootstrap.GetEnvironment(cfg.Logging.Development)),
	)

	runtime, err := appruntime.New(cfg)
	if err != nil {
		logger.Error("Failed to initialize runtime", zap.Error(err))
		os.Exit(1)
	}

	runtime.Run()
}
