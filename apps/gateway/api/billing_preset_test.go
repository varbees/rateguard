//go:build commercial

package api

import "testing"

func TestResolveCheckoutPreset(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "trims preset",
			in:   "  starter ",
			want: "starter",
		},
		{
			name: "empty preset",
			in:   "",
			want: "",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if got := resolveCheckoutPreset(tt.in); got != tt.want {
				t.Fatalf("resolveCheckoutPreset() = %q, want %q", got, tt.want)
			}
		})
	}
}
