package rateguard

import "testing"

func TestNormalizePreset(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		in   string
		want string
	}{
		{name: "empty", in: "", want: "dev"},
		{name: "free", in: "free", want: "dev"},
		{name: "dev", in: "dev", want: "dev"},
		{name: "starter", in: "starter", want: "standard"},
		{name: "standard", in: "standard", want: "standard"},
		{name: "pro", in: "pro", want: "high-throughput"},
		{name: "business", in: "business", want: "llm-heavy"},
		{name: "strict", in: "strict-upstream-protection", want: "strict-upstream-protection"},
		{name: "unknown", in: "unknown", want: "dev"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := NormalizePreset(tc.in); got != tc.want {
				t.Fatalf("NormalizePreset(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestPresetPolicyDefaults(t *testing.T) {
	t.Parallel()

	got := PresetPolicy("starter")

	if got.Name != "standard" {
		t.Fatalf("PresetPolicy(\"starter\").Name = %q, want %q", got.Name, "standard")
	}
	if got.RequestsPerSecond != 100 {
		t.Fatalf("PresetPolicy(\"starter\").RequestsPerSecond = %d, want 100", got.RequestsPerSecond)
	}
	if got.Burst != 200 {
		t.Fatalf("PresetPolicy(\"starter\").Burst = %d, want 200", got.Burst)
	}
	if got.MaxTokensPerMonth != 10000000 {
		t.Fatalf("PresetPolicy(\"starter\").MaxTokensPerMonth = %d, want 10000000", got.MaxTokensPerMonth)
	}
	if got.AnalyticsRetentionDays != 30 {
		t.Fatalf("PresetPolicy(\"starter\").AnalyticsRetentionDays = %d, want 30", got.AnalyticsRetentionDays)
	}
	if got.Webhooks {
		t.Fatalf("PresetPolicy(\"starter\").Webhooks = true, want false")
	}
}
