package settings

type WorkingDirectoryResponse struct {
	Path       string `json:"path"`
	Configured bool   `json:"configured"`
}

type UpdateWorkingDirectoryRequest struct {
	Path string `json:"path"`
}
