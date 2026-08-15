package app

import (
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var errInvalidAIProxy = errors.New("invalid AI proxy configuration")

func newAIHTTPClient(rawProxyURL string) (*http.Client, error) {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = 20 * time.Second
	transport.TLSHandshakeTimeout = 10 * time.Second

	rawProxyURL = strings.TrimSpace(rawProxyURL)
	if rawProxyURL != "" {
		proxyURL, err := url.Parse(rawProxyURL)
		if err != nil || proxyURL.Host == "" || (proxyURL.Scheme != "http" && proxyURL.Scheme != "https" && proxyURL.Scheme != "socks5") {
			return nil, errInvalidAIProxy
		}
		transport.Proxy = http.ProxyURL(proxyURL)
	}

	return &http.Client{Transport: transport, Timeout: 25 * time.Second}, nil
}

func (s *Server) doAIRequest(request *http.Request) (*http.Response, error) {
	if s.aiClientErr != nil {
		return nil, s.aiClientErr
	}
	if s.aiClient == nil {
		return nil, errors.New("AI HTTP client is not initialized")
	}
	return s.aiClient.Do(request)
}
