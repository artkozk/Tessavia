package app

import (
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var errInvalidAIProxy = errors.New("invalid AI proxy configuration")

func newAIHTTPClient(rawProxyURL string) (*http.Client, error) {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.DialContext = (&net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}).DialContext
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

func newAIHTTPClients(rawProxyURLs []string) ([]*http.Client, error) {
	if len(rawProxyURLs) == 0 {
		client, err := newAIHTTPClient("")
		if err != nil {
			return nil, err
		}
		return []*http.Client{client}, nil
	}

	clients := make([]*http.Client, 0, len(rawProxyURLs))
	for _, rawProxyURL := range rawProxyURLs {
		client, err := newAIHTTPClient(rawProxyURL)
		if err != nil {
			return nil, err
		}
		clients = append(clients, client)
	}
	return clients, nil
}

func (s *Server) doAIRequest(request *http.Request) (*http.Response, error) {
	if s.aiClientErr != nil {
		return nil, s.aiClientErr
	}
	clients := s.aiClients
	if len(clients) == 0 && s.aiClient != nil {
		clients = []*http.Client{s.aiClient}
	}
	if len(clients) == 0 {
		return nil, errors.New("AI HTTP client is not initialized")
	}

	start := int(s.aiCursor.Load()) % len(clients)
	routeErrors := make([]error, 0, len(clients))
	for offset := 0; offset < len(clients); offset++ {
		index := (start + offset) % len(clients)
		attempt, err := replayableAIRequest(request)
		if err != nil {
			return nil, err
		}
		response, err := clients[index].Do(attempt)
		if err != nil {
			routeErrors = append(routeErrors, fmt.Errorf("AI route %d: %w", index+1, err))
			continue
		}
		if retryableAIStatus(response.StatusCode) && offset < len(clients)-1 {
			_, _ = io.Copy(io.Discard, response.Body)
			_ = response.Body.Close()
			routeErrors = append(routeErrors, fmt.Errorf("AI route %d returned status %d", index+1, response.StatusCode))
			continue
		}
		if !retryableAIStatus(response.StatusCode) {
			s.aiCursor.Store(uint32(index))
		}
		return response, nil
	}
	return nil, fmt.Errorf("all configured AI routes failed: %w", errors.Join(routeErrors...))
}

func replayableAIRequest(request *http.Request) (*http.Request, error) {
	attempt := request.Clone(request.Context())
	if request.Body == nil {
		return attempt, nil
	}
	if request.GetBody == nil {
		return nil, errors.New("AI request body cannot be replayed")
	}
	body, err := request.GetBody()
	if err != nil {
		return nil, fmt.Errorf("replay AI request body: %w", err)
	}
	attempt.Body = body
	return attempt, nil
}

func retryableAIStatus(status int) bool {
	switch status {
	case http.StatusProxyAuthRequired, http.StatusBadGateway, http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		return true
	default:
		return false
	}
}
