import axios, { AxiosInstance, AxiosError } from 'axios';
import { OpenAIChatRequest, OpenAIChatResponse } from '../types';
import { ModelConfig } from '../utils/config';
import { Readable } from 'stream';

export class OpenAIService {
  private client: AxiosInstance;
  private modelConfig: ModelConfig;

  constructor(modelConfig: ModelConfig) {
    this.modelConfig = modelConfig;
    
    if (!modelConfig.config.api_key) {
      throw new Error('API key is required for model ${modelConfig.id}');
    }

    this.client = axios.create({
      baseURL: modelConfig.config.base_url,
      headers: {
        'Authorization': `Bearer ${modelConfig.config.api_key}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });
  }

  async createChatCompletion(request: OpenAIChatRequest): Promise<OpenAIChatResponse> {
    try {
      const response = await this.client.post('/v1/chat/completions', request);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<{ error?: { message?: string } }>;
        const fullUrl = `${this.modelConfig.config.base_url}/v1/chat/completions`;
        
        // Log detailed error information
        const requestHeaders = axiosError.config?.headers || {};
        const responseHeaders = axiosError.response?.headers || {};
        const requestBodyPreview = JSON.stringify(request).slice(0, 500) + (JSON.stringify(request).length > 500 ? '...' : '');
        
        console.error('OpenAI API Request Failed:');
        console.error(`URL: POST ${fullUrl}`);
        console.error(`Request Headers:`, requestHeaders);
        console.error(`Request Body (preview):`, requestBodyPreview);
        console.error(`Response Status:`, axiosError.response?.status);
        console.error(`Response Headers:`, responseHeaders);
        console.error(`Response Data:`, axiosError.response?.data);
        
        if (axiosError.response) {
          const errorMessage = axiosError.response.data?.error?.message || axiosError.response.statusText;
          throw new Error(`OpenAI API error: ${errorMessage} (POST ${fullUrl} - ${axiosError.response.status})`);
        }
        throw new Error(`Failed to connect to OpenAI API: ${axiosError.message} (POST ${fullUrl})`);
      }
      throw error;
    }
  }

  async createChatCompletionStream(request: OpenAIChatRequest): Promise<Readable> {
    try {
      const response = await this.client.post('/v1/chat/completions', {
        ...request,
        stream: true,
      }, {
        responseType: 'stream',
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<{ error?: { message?: string } }>;
        const fullUrl = `${this.modelConfig.config.base_url}/v1/chat/completions`;
        
        // Log detailed error information
        const requestHeaders = axiosError.config?.headers || {};
        const responseHeaders = axiosError.response?.headers || {};
        const streamRequest = { ...request, stream: true };
        const requestBodyPreview = JSON.stringify(streamRequest).slice(0, 500) + (JSON.stringify(streamRequest).length > 500 ? '...' : '');
        
        console.error('OpenAI API Stream Request Failed:');
        console.error(`URL: POST ${fullUrl}`);
        console.error(`Request Headers:`, requestHeaders);
        console.error(`Request Body (preview):`, requestBodyPreview);
        console.error(`Response Status:`, axiosError.response?.status);
        console.error(`Response Headers:`, responseHeaders);
        console.error(`Response Data:`, axiosError.response?.data);
        
        if (axiosError.response) {
          const errorMessage = axiosError.response.data?.error?.message || axiosError.response.statusText;
          throw new Error(`OpenAI API error: ${errorMessage} (POST ${fullUrl} - ${axiosError.response.status})`);
        }
        throw new Error(`Failed to connect to OpenAI API: ${axiosError.message} (POST ${fullUrl})`);
      }
      throw error;
    }
  }
}