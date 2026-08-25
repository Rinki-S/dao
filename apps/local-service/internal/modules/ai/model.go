package ai

// ProviderSettings is what the app is pointed at. There is no field for the
// key: it never leaves the process it was handed to, so it cannot be part of
// anything the renderer can read. Only whether one is present is reportable.
type ProviderSettings struct {
	Wire       string `json:"wire"`
	BaseURL    string `json:"baseUrl"`
	Model      string `json:"model"`
	KeyPresent bool   `json:"keyPresent"`
	Configured bool   `json:"configured"`
}

type UpdateProviderSettingsRequest struct {
	Wire    string `json:"wire"`
	BaseURL string `json:"baseUrl"`
	Model   string `json:"model"`
}
