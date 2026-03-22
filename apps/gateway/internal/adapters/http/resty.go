package httpadapter

import (
	"fmt"

	"github.com/go-resty/resty/v2"
)

// ExecuteRestyRequest dispatches a request using the requested HTTP method.
func ExecuteRestyRequest(req *resty.Request, method, targetURL string) (*resty.Response, error) {
	switch method {
	case "GET":
		return req.Get(targetURL)
	case "POST":
		return req.Post(targetURL)
	case "PUT":
		return req.Put(targetURL)
	case "DELETE":
		return req.Delete(targetURL)
	case "PATCH":
		return req.Patch(targetURL)
	default:
		return nil, fmt.Errorf("unsupported HTTP method: %s", method)
	}
}
