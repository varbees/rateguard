package main

import (
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/pterm/pterm"
	vegeta "github.com/tsenart/vegeta/v12/lib"
)

type Config struct {
	TargetURL string
	QPS       int
	Duration  time.Duration
	Workers   int
	Scenario  string
}

func main() {
	// Parse flags
	config := Config{}
	flag.StringVar(&config.TargetURL, "url", "http://localhost:8008/proxy/agify/?name=test", "Target URL to attack")
	flag.IntVar(&config.QPS, "qps", 50, "Queries per second")
	flag.DurationVar(&config.Duration, "duration", 10*time.Second, "Duration of the test")
	flag.IntVar(&config.Workers, "workers", 10, "Number of initial workers")
	flag.StringVar(&config.Scenario, "scenario", "sustained", "Test scenario: sustained, ramp-up, spike")
	flag.Parse()

	// Initialize UI
	pterm.DefaultBigText.WithLetters(pterm.NewLettersFromString("LoadTest")).Render()
	pterm.Info.Printf("Target: %s\n", config.TargetURL)
	pterm.Info.Printf("Scenario: %s\n", config.Scenario)
	pterm.Info.Printf("QPS: %d\n", config.QPS)
	pterm.Info.Printf("Duration: %s\n", config.Duration)

	// Run selected scenario
	switch config.Scenario {
	case "sustained":
		runSustainedLoad(config)
	case "ramp-up":
		runRampUpLoad(config)
	case "spike":
		runSpikeLoad(config)
	default:
		pterm.Error.Printf("Unknown scenario: %s\n", config.Scenario)
		os.Exit(1)
	}
}

func runSustainedLoad(config Config) {
	rate := vegeta.Rate{Freq: config.QPS, Per: time.Second}
	duration := config.Duration
	targeter := vegeta.NewStaticTargeter(vegeta.Target{
		Method: "GET",
		URL:    config.TargetURL,
	})
	attacker := vegeta.NewAttacker(vegeta.Workers(uint64(config.Workers)))

	var metrics vegeta.Metrics
	pterm.DefaultSection.Println("Running Sustained Load Test")
	
	bar, _ := pterm.DefaultProgressbar.WithTotal(int(duration.Seconds())).WithTitle("Attacking...").Start()

	for res := range attacker.Attack(targeter, rate, duration, "Sustained Load") {
		metrics.Add(res)
		// Update progress bar every second roughly (approximation)
		// In real implementation, we'd use a ticker or callback
	}
	bar.Stop()
	metrics.Close()

	printReport(metrics)
}

func runRampUpLoad(config Config) {
	pterm.DefaultSection.Println("Running Ramp-Up Load Test")
	
	startRate := 10
	endRate := config.QPS
	steps := 10
	stepDuration := config.Duration / time.Duration(steps)
	
	targeter := vegeta.NewStaticTargeter(vegeta.Target{
		Method: "GET",
		URL:    config.TargetURL,
	})
	
	var globalMetrics vegeta.Metrics
	
	bar, _ := pterm.DefaultProgressbar.WithTotal(steps).WithTitle("Ramping up...").Start()
	
	for i := 0; i < steps; i++ {
		currentRate := startRate + (endRate-startRate)*i/(steps-1)
		pterm.Info.Printf("Step %d/%d: %d req/s for %s\n", i+1, steps, currentRate, stepDuration)
		
		rate := vegeta.Rate{Freq: currentRate, Per: time.Second}
		attacker := vegeta.NewAttacker(vegeta.Workers(uint64(config.Workers)))
		
		for res := range attacker.Attack(targeter, rate, stepDuration, fmt.Sprintf("Ramp-Up Step %d", i)) {
			globalMetrics.Add(res)
		}
		bar.Increment()
	}
	bar.Stop()
	globalMetrics.Close()
	
	printReport(globalMetrics)
}

func runSpikeLoad(config Config) {
	pterm.DefaultSection.Println("Running Spike Load Test")
	
	// Base load
	baseRate := 10
	spikeRate := config.QPS * 2 // Double the configured QPS for spike
	
	targeter := vegeta.NewStaticTargeter(vegeta.Target{
		Method: "GET",
		URL:    config.TargetURL,
	})
	
	var globalMetrics vegeta.Metrics
	
	// 1. Base Load (30%)
	duration1 := config.Duration / 3
	pterm.Info.Printf("Phase 1: Base Load (%d req/s) for %s\n", baseRate, duration1)
	attacker1 := vegeta.NewAttacker(vegeta.Workers(uint64(config.Workers)))
	for res := range attacker1.Attack(targeter, vegeta.Rate{Freq: baseRate, Per: time.Second}, duration1, "Base Load 1") {
		globalMetrics.Add(res)
	}
	
	// 2. Spike (30%)
	duration2 := config.Duration / 3
	pterm.Info.Printf("Phase 2: SPIKE (%d req/s) for %s\n", spikeRate, duration2)
	attacker2 := vegeta.NewAttacker(vegeta.Workers(uint64(config.Workers * 2))) // More workers for spike
	for res := range attacker2.Attack(targeter, vegeta.Rate{Freq: spikeRate, Per: time.Second}, duration2, "Spike") {
		globalMetrics.Add(res)
	}
	
	// 3. Cooldown (40%)
	duration3 := config.Duration - duration1 - duration2
	pterm.Info.Printf("Phase 3: Cooldown (%d req/s) for %s\n", baseRate, duration3)
	attacker3 := vegeta.NewAttacker(vegeta.Workers(uint64(config.Workers)))
	for res := range attacker3.Attack(targeter, vegeta.Rate{Freq: baseRate, Per: time.Second}, duration3, "Cooldown") {
		globalMetrics.Add(res)
	}
	
	globalMetrics.Close()
	printReport(globalMetrics)
}

func printReport(metrics vegeta.Metrics) {
	pterm.DefaultHeader.WithFullWidth().Println("Test Results")
	
	data := [][]string{
		{"Metric", "Value"},
		{"Requests", fmt.Sprintf("%d", metrics.Requests)},
		{"Rate", fmt.Sprintf("%.2f req/s", metrics.Rate)},
		{"Throughput", fmt.Sprintf("%.2f req/s", metrics.Throughput)},
		{"Success %", fmt.Sprintf("%.2f%%", metrics.Success*100)},
		{"Latencies (P50)", fmt.Sprintf("%s", metrics.Latencies.P50)},
		{"Latencies (P95)", fmt.Sprintf("%s", metrics.Latencies.P95)},
		{"Latencies (P99)", fmt.Sprintf("%s", metrics.Latencies.P99)},
		{"Latencies (Max)", fmt.Sprintf("%s", metrics.Latencies.Max)},
	}

	pterm.DefaultTable.WithHasHeader().WithData(data).Render()
}
