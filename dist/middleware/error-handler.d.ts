import { Request, Response } from 'express';
export interface ApiError extends Error {
    statusCode?: number;
    type?: string;
}
export declare const errorHandler: (error: ApiError, req: Request, res: Response) => void;
export declare const createError: (message: string, statusCode?: number, type?: string) => ApiError;
//# sourceMappingURL=error-handler.d.ts.map