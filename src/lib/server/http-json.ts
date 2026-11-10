import type { IncomingMessage, ServerResponse } from 'node:http';

export async function readJsonObject<T>(
	request: IncomingMessage,
	requestLabel: string,
	objectDescription = 'an object'
): Promise<T> {
	let body = '';
	for await (const chunk of request) {
		body += chunk.toString();
		if (body.length > 64 * 1024) throw new Error(`${requestLabel} request is too large.`);
	}
	const value: unknown = JSON.parse(body);
	if (!isRecord(value)) throw new Error(`${requestLabel} request must be ${objectDescription}.`);
	return value as T;
}

export function sendJson(
	response: ServerResponse,
	statusCode: number,
	value: unknown,
	cacheControl?: string
): void {
	response.statusCode = statusCode;
	response.setHeader('content-type', 'application/json; charset=utf-8');
	if (cacheControl) response.setHeader('cache-control', cacheControl);
	response.end(JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
