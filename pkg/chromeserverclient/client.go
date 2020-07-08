package chromeserverclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"

	"github.com/function61/gokit/envvar"
	"github.com/function61/gokit/ezhttp"
	"github.com/function61/gokit/jsonfile"
)

type Output struct {
	LogMessages            []string         `json:"logMessages"`
	ErrorMessages          []string         `json:"errorMessages"`
	Error                  *string          `json:"error,omitempty"`
	ErrorAutoScreenshotUrl *string          `json:"errorAutoScreenshotUrl,omitempty"`
	Data                   *json.RawMessage `json:"data,omitempty"`
}

const (
	Function61 = "https://function61.com/api/chromeserver"
)

type AuthTokenObtainer func() (string, error)

type Options struct {
	ErrorAutoScreenshot bool
	Params              map[string]string
}

type Client struct {
	baseUrl   string
	authToken string
}

func New(baseUrl string, obtainAuthToken AuthTokenObtainer) (*Client, error) {
	authToken, err := obtainAuthToken()
	if err != nil {
		return nil, err
	}

	return &Client{baseUrl, authToken}, nil
}

func (c *Client) Run(
	ctx context.Context,
	script string,
	data interface{},
	opts *Options,
) (*Output, error) {
	if opts == nil {
		opts = &Options{}
	}

	queryPars := url.Values{}
	if opts.ErrorAutoScreenshot {
		queryPars.Set("errorAutoScreenshot", "1")
	}

	for key, val := range opts.Params {
		queryPars.Set(key, val)
	}

	output := &Output{}
	if _, err := ezhttp.Post(
		ctx,
		c.baseUrl+"/job?"+queryPars.Encode(),
		ezhttp.AuthBearer(c.authToken),
		ezhttp.SendBody(strings.NewReader(script), "application/javascript"),
		ezhttp.RespondsJson(output, false),
	); err != nil {
		return nil, fmt.Errorf("chromeserver: %w", err)
	}

	if output.Error != nil {
		scriptError := *output.Error

		// hack to not repeat error in JSON
		output.Error = nil

		responseJsonWithoutErrorRepeated, err := json.Marshal(output)
		if err != nil {
			return nil, err
		}

		return nil, fmt.Errorf(
			"script error: %s\n\n%s",
			scriptError,
			responseJsonWithoutErrorRepeated)
	}

	if output.Data == nil {
		return nil, errors.New("no data in response JSON")
	}

	return output, jsonfile.Unmarshal(bytes.NewReader(*output.Data), data, true)
}

func StaticToken(token string) AuthTokenObtainer {
	return func() (string, error) {
		return token, nil
	}
}

func TokenFromEnv() (string, error) {
	return envvar.Required("CHROMESERVER_AUTH_TOKEN")
}
