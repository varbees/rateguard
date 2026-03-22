package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"time"

	"github.com/gorilla/websocket"
)

func main() {
	urlStr := flag.String("url", "", "WebSocket URL to connect to")
	duration := flag.Duration("duration", 0, "Duration to keep connection open (0 for infinite)")
	verbose := flag.Bool("v", false, "Verbose output")
	flag.Parse()

	if *urlStr == "" {
		log.Fatal("URL is required")
	}

	u, err := url.Parse(*urlStr)
	if err != nil {
		log.Fatal("Invalid URL:", err)
	}

	if *verbose {
		log.Printf("Connecting to %s", u.String())
	}

	// Set Origin header to match the URL scheme/host
	origin := *urlStr
	if u.Scheme == "wss" {
		origin = "https://" + u.Host
	} else {
		origin = "http://" + u.Host
	}
	
	headers := make(http.Header)
	headers.Set("Origin", origin)

	c, resp, err := websocket.DefaultDialer.Dial(u.String(), headers)
	if err != nil {
		if resp != nil {
			log.Printf("Handshake failed with status: %d %s", resp.StatusCode, resp.Status)
			// Try to read body
			buf := make([]byte, 1024)
			n, _ := resp.Body.Read(buf)
			log.Printf("Response body: %s", string(buf[:n]))
		}
		log.Fatal("dial:", err)
	}
	defer c.Close()

	done := make(chan struct{})

	go func() {
		defer close(done)
		for {
			_, message, err := c.ReadMessage()
			if err != nil {
				if *verbose {
					log.Println("read:", err)
				}
				return
			}
			fmt.Printf("%s\n", message)
		}
	}()

	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)

	var timer <-chan time.Time
	if *duration > 0 {
		timer = time.After(*duration)
	}

	select {
	case <-done:
		return
	case <-interrupt:
		if *verbose {
			log.Println("interrupt")
		}
		
		// Cleanly close the connection by sending a close message and then
		// waiting (with timeout) for the server to close the connection.
		err := c.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
		if err != nil {
			if *verbose {
				log.Println("write close:", err)
			}
			return
		}
		select {
		case <-done:
		case <-time.After(time.Second):
		}
	case <-timer:
		if *verbose {
			log.Println("duration reached")
		}
		// Just close, no need for handshake on timeout
		return
	}
}
