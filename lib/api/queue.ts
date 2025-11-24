import axios from "axios";
import { API_BASE_URL } from "@/lib/config";

export interface QueuedRequest {
  request_id: string;
  target_api: string;
  method: string;
  path: string;
  enqueued_at: string;
  queued_for_ms: number;
  position: number;
  est_wait_time_ms: number;
}

export interface APIQueue {
  api_name: string;
  queued_requests: number;
  avg_wait_time_ms: number;
  rate_limit_hits_24h: number;
}

export interface QueueStats {
  active_queues: number;
  total_queued_requests: number;
  longest_queued_time_ms: number;
  avg_wait_time_ms: number;
  peak_queue_length: number;
  total_requests_queued_24h: number;
  queued_by_api: APIQueue[];
  timestamp: string;
}

export interface APIQueueConfig {
  api_name: string;
  enabled: boolean;
  max_wait_time_ms: number;
  max_queue_length: number;
  priority: number;
}

export interface QueueConfig {
  enabled: boolean;
  max_wait_time_ms: number;
  queueing_strategy: "fifo" | "priority" | "weighted";
  per_api_settings: APIQueueConfig[];
}

// Queue API client
export const QueueAPI = {
  // Get queue statistics
  getQueueStats: async (): Promise<QueueStats> => {
    const response = await axios.get(`${API_BASE_URL}/dashboard/queues`);
    return response.data;
  },

  // Get active queued requests
  getActiveQueues: async (): Promise<QueuedRequest[]> => {
    const response = await axios.get(`${API_BASE_URL}/dashboard/queues/active`);
    return response.data;
  },

  // Get queue configuration
  getQueueConfig: async (): Promise<QueueConfig> => {
    const response = await axios.get(`${API_BASE_URL}/dashboard/queues/config`);
    return response.data;
  },

  // Update queue configuration
  updateQueueConfig: async (config: QueueConfig): Promise<QueueConfig> => {
    const response = await axios.put(
      `${API_BASE_URL}/dashboard/queues/config`,
      config
    );
    return response.data;
  },

  // Cancel a queued request
  cancelQueuedRequest: async (
    requestId: string
  ): Promise<{ cancelled: boolean }> => {
    const response = await axios.delete(
      `${API_BASE_URL}/dashboard/queues/${requestId}`
    );
    return response.data;
  },
};

export default QueueAPI;
