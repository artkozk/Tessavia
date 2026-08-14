package main

import (
	"log"
	"net/http"
	"time"

	"business-control/internal/app"
)

func main() {
	config := app.LoadConfig()
	store, err := app.OpenStore(config.DatabasePath)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer store.Close()

	server := &http.Server{
		Addr:              config.Address,
		Handler:           app.NewServer(store, config),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Printf("business control listening on %s", config.Address)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("serve: %v", err)
	}
}
