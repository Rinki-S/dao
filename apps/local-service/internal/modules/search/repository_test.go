package search

import "testing"

func TestBuildMatchQuery(t *testing.T) {
	tests := []struct {
		name  string
		query string
		want  string
	}{
		{
			name:  "empty",
			query: "",
			want:  "",
		},
		{
			name:  "whitespace",
			query: "   ",
			want:  "",
		},
		{
			name:  "multiple words",
			query: "redis cache",
			want:  `"redis"* "cache"*`,
		},
		{
			name:  "dotted technical term",
			query: "React.js",
			want:  `"React"* "js"*`,
		},
		{
			name:  "symbol heavy technical term",
			query: "C++",
			want:  `"C"*`,
		},
		{
			name:  "underscore technical term",
			query: "node_modules",
			want:  `"node"* "modules"*`,
		},
		{
			name:  "url",
			query: "http://localhost:5173",
			want:  `"http"* "localhost"* "5173"*`,
		},
		{
			name:  "cjk phrase",
			query: "缓存击穿",
			want:  `"缓存击穿"*`,
		},
		{
			name:  "invalid quote",
			query: `"bad query`,
			want:  `"bad"* "query"*`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := buildMatchQuery(tt.query)
			if got != tt.want {
				t.Fatalf("buildMatchQuery(%q) = %q, want %q", tt.query, got, tt.want)
			}
		})
	}
}
