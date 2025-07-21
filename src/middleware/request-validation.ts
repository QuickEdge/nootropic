import { Request, Response, NextFunction } from 'express';
import { AnthropicRequest } from '../types';
import { createError } from './error-handler';

export const validateAnthropicRequest = (req: Request, res: Response, next: NextFunction) => {
  try {
    const request: AnthropicRequest = req.body;

    // Basic structure validation
    if (!request || typeof request !== 'object') {
      throw createError('Request body must be a valid JSON object', 400, 'invalid_request_error');
    }

    // Required field validation
    if (!request.model || typeof request.model !== 'string') {
      throw createError('Model is required and must be a string', 400, 'invalid_request_error');
    }

    if (!request.messages || !Array.isArray(request.messages)) {
      throw createError('Messages is required and must be an array', 400, 'invalid_request_error');
    }

    if (request.messages.length === 0) {
      throw createError('Messages array cannot be empty', 400, 'invalid_request_error');
    }

    // Validate message structure
    for (let i = 0; i < request.messages.length; i++) {
      const message = request.messages[i];
      
      if (!message || typeof message !== 'object') {
        throw createError(`Message at index ${i} must be an object`, 400, 'invalid_request_error');
      }

      if (!message.role || !['user', 'assistant'].includes(message.role)) {
        throw createError(`Message at index ${i} must have role 'user' or 'assistant'`, 400, 'invalid_request_error');
      }

      if (!message.content) {
        throw createError(`Message at index ${i} must have content`, 400, 'invalid_request_error');
      }
    }

    // Optional field validation with type checking
    if (request.max_tokens !== undefined) {
      if (typeof request.max_tokens !== 'number' || request.max_tokens <= 0) {
        throw createError('max_tokens must be a positive number', 400, 'invalid_request_error');
      }
    }

    if (request.temperature !== undefined) {
      if (typeof request.temperature !== 'number' || request.temperature < 0 || request.temperature > 2) {
        throw createError('temperature must be a number between 0 and 2', 400, 'invalid_request_error');
      }
    }

    if (request.top_p !== undefined) {
      if (typeof request.top_p !== 'number' || request.top_p < 0 || request.top_p > 1) {
        throw createError('top_p must be a number between 0 and 1', 400, 'invalid_request_error');
      }
    }

    if (request.top_k !== undefined) {
      if (typeof request.top_k !== 'number' || request.top_k < 1) {
        throw createError('top_k must be a positive number', 400, 'invalid_request_error');
      }
    }

    if (request.stream !== undefined) {
      if (typeof request.stream !== 'boolean') {
        throw createError('stream must be a boolean', 400, 'invalid_request_error');
      }
    }

    if (request.stop_sequences !== undefined) {
      if (!Array.isArray(request.stop_sequences)) {
        throw createError('stop_sequences must be an array', 400, 'invalid_request_error');
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};