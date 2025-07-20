import axios, { AxiosInstance } from 'axios';
import { AnthropicRequest, AnthropicResponse } from '../types';

export class AnthropicService {
  private client: AxiosInstance;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    this.client = axios.create({
      baseURL: 'https://api.anthropic.com',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      timeout: 60000,
    });
  }

  async createMessage(request: AnthropicRequest): Promise<AnthropicResponse> {
    try {
      const response = await this.client.post('/v1/messages', request);
      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(`Anthropic API error: ${error.response.data?.error?.message || error.response.statusText}`);
      }
      throw new Error(`Failed to connect to Anthropic API: ${error.message}`);
    }
  }

  async createMessageStream(request: AnthropicRequest): Promise<any> {
    try {
      const response = await this.client.post('/v1/messages', {
        ...request,
        stream: true,
      }, {
        responseType: 'stream',
      });
      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(`Anthropic API error: ${error.response.data?.error?.message || error.response.statusText}`);
      }
      throw new Error(`Failed to connect to Anthropic API: ${error.message}`);
    }
  }
}