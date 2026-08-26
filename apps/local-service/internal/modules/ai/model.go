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

// UpdateCredentialRequest replaces the secret this process is using.
//
// It exists because an access token expires while the process runs. The
// desktop process renews it — it is the one holding the refresh token and the
// keychain — and hands the result over here. Restarting the service to collect
// a new token every hour would work and would be absurd.
type UpdateCredentialRequest struct {
	// Kind is api-key or oauth-token. It decides how the secret is presented,
	// not what it is worth.
	Kind string `json:"kind"`
	// Secret is empty to disconnect, which is how the desktop process reports
	// that the stored credential was cleared.
	Secret string `json:"secret"`
}
