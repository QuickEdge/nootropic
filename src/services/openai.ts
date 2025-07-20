import axios, { AxiosInstance } from 'axios';
import { OpenAIChatRequest, OpenAIChatResponse } from '../types';

export class OpenAIService {
  private client: AxiosInstance;

  constructor(apiKey?: string, baseURL?: string) {
    const key = apiKey || process.env.NOOTROPIC_API_KEY;
    const url = baseURL || process.env.NOOTROPIC_API_BASE_URL || 'https://api.openai.com';

    if (!key) {
      throw new Error('NOOTROPIC_API_KEY is required');
    }

    this.client = axios.create({
      baseURL: url,
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });
  }

  async createChatCompletion(request: OpenAIChatRequest): Promise<OpenAIChatResponse> {
    try {
      const response = await this.client.post('/v1/chat/completions', request);
      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(`OpenAI API error: ${error.response.data?.error?.message || error.response.statusText}`);
      }
      throw new Error(`Failed to connect to OpenAI API: ${error.message}`);
    }
  }

  async createChatCompletionStream(request: OpenAIChatRequest): Promise<any> {
    try {
      const response = await this.client.post('/v1/chat/completions', {
        ...request,
        stream: true,
      }, {
        responseType: 'stream',
      });
      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(`OpenAI API error: ${error.response.data?.error?.message || error.response.statusText}`);
      }
      throw new Error(`Failed to connect to OpenAI API: ${error.message}`);
    }
  }
}