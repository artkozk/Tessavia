package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
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
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if config.ReminderWorkerEnabled {
		go app.RunReminderWorker(ctx, store)
	}
	go app.RunPushWorker(ctx, store, config)

	server := &http.Server{
		Addr:              config.Address,
		Handler:           app.NewServer(store, config),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Printf("Tessavie listening on %s", config.Address)
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			log.Printf("shutdown: %v", err)
		}
	}()
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("serve: %v", err)
	}
}
