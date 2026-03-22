package api

import (
	"bufio"
	"context"
	"io"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/internal/proxy"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

type transparentStreamingMetricsRecorder interface {
	TrackStreamingMetrics(
		ctx context.Context,
		userID uuid.UUID,
		apiName string,
		statusCode int,
		bytesStreamed int64,
		duration time.Duration,
		streamType string,
	) error
}

type transparentStreamingTokenRecorder interface {
	TrackStreamingLLMResponse(
		ctx context.Context,
		userID uuid.UUID,
		apiName string,
		provider string,
		model string,
		tokenUsage proxy.TokenUsage,
		statusCode int,
		duration time.Duration,
	)
}

func streamTransparentProxyResponse(
	c *fiber.Ctx,
	response *models.ProxyResponse,
	requestID string,
	userID uuid.UUID,
	apiName string,
	recorder transparentStreamingMetricsRecorder,
	tokenRecorder transparentStreamingTokenRecorder,
) error {
	startTime := time.Now()
	accumulator := proxy.NewStreamingTokenAccumulator(response.LLMProvider)

	c.Status(response.StatusCode)
	c.Set("Content-Type", response.Headers.Get("Content-Type"))
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")

	setProxyTrackingHeaders(c, response, apiName, true, true, true, map[string]string{
		"X-RateGuard-Streaming":   "true",
		"X-RateGuard-Stream-Type": response.StreamingType,
	})

	bytesStreamed := int64(0)
	streamError := error(nil)

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		defer response.RawBody.Close()
		defer func() {
			if response.QueueRelease != nil {
				release := response.QueueRelease
				response.QueueRelease = nil
				release()
			}

			streamDuration := time.Since(startTime)
			if response.LLMProvider == "" || tokenRecorder == nil {
				go recordTransparentStreamingMetrics(
					recorder,
					requestID,
					userID,
					apiName,
					response.StatusCode,
					bytesStreamed,
					streamDuration,
					response.StreamingType,
				)
				return
			}

			tokenUsage, err := accumulator.Finish()
			if err != nil {
				logger.Debug("No streaming token usage found",
					zap.String("request_id", requestID),
					zap.String("user_id", userID.String()),
					zap.String("api_name", apiName),
					zap.Error(err),
				)
			} else {
				go func() {
					ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
					defer cancel()

					tokenRecorder.TrackStreamingLLMResponse(
						ctx,
						userID,
						apiName,
						response.LLMProvider,
						response.LLMModel,
						tokenUsage,
						response.StatusCode,
						streamDuration,
					)
				}()
			}

			go recordTransparentStreamingMetrics(
				recorder,
				requestID,
				userID,
				apiName,
				response.StatusCode,
				bytesStreamed,
				streamDuration,
				response.StreamingType,
			)
		}()

		buffer := make([]byte, 4096)

		for {
			n, err := response.RawBody.Read(buffer)

			if n > 0 {
				accumulator.Write(buffer[:n])
				written, writeErr := w.Write(buffer[:n])
				if writeErr != nil {
					logger.Error("Stream write error",
						zap.String("request_id", requestID),
						zap.String("user_id", userID.String()),
						zap.String("api_name", apiName),
						zap.Error(writeErr),
					)
					streamError = writeErr
					return
				}

				bytesStreamed += int64(written)

				if flushErr := w.Flush(); flushErr != nil {
					logger.Error("Stream flush error",
						zap.String("request_id", requestID),
						zap.Error(flushErr),
					)
					streamError = flushErr
					return
				}
			}

			if err == io.EOF {
				break
			}

			if err != nil {
				logger.Error("Stream read error",
					zap.String("request_id", requestID),
					zap.String("user_id", userID.String()),
					zap.String("api_name", apiName),
					zap.Error(err),
				)
				streamError = err
				return
			}
		}

		_ = w.Flush()

		logger.Info("Stream completed",
			zap.String("request_id", requestID),
			zap.String("user_id", userID.String()),
			zap.String("api_name", apiName),
			zap.Int64("bytes_streamed", bytesStreamed),
			zap.Duration("stream_duration", time.Since(startTime)),
			zap.String("stream_type", response.StreamingType),
		)
	})

	if streamError != nil {
		return streamError
	}

	return nil
}

func recordTransparentStreamingMetrics(
	recorder transparentStreamingMetricsRecorder,
	requestID string,
	userID uuid.UUID,
	apiName string,
	statusCode int,
	bytesStreamed int64,
	duration time.Duration,
	streamType string,
) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := recorder.TrackStreamingMetrics(
		ctx,
		userID,
		apiName,
		statusCode,
		bytesStreamed,
		duration,
		streamType,
	); err != nil {
		logger.Error("Failed to track streaming metrics",
			zap.String("request_id", requestID),
			zap.Error(err),
		)
	}
}
