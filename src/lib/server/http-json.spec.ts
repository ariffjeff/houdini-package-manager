import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { readJsonObject, sendJson } from './http-json.js';

function requestFrom(body: string): IncomingMessage {
	return Readable.from([body]) as unknown as IncomingMessage;
}

describe('readJsonObject', () => {
	it('parses JSON objects', async () => {
		await expect(readJsonObject(requestFrom('{"urls":[]}'), 'Plugin discovery')).resolves.toEqual({
			urls: []
		});
	});

	it('rejects non-object JSON values', async () => {
		await expect(readJsonObject(requestFrom('[]'), 'Install')).rejects.toThrow(
			'Install request must be an object.'
		);
		await expect(
			readJsonObject(requestFrom('[]'), 'Plugin discovery', 'a JSON object')
		).rejects.toThrow('Plugin discovery request must be a JSON object.');
	});

	it('rejects request bodies larger than 64 KB', async () => {
		await expect(readJsonObject(requestFrom(' '.repeat(64 * 1024 + 1)), 'Install')).rejects.toThrow(
			'Install request is too large.'
		);
	});
});

it('sends JSON with endpoint-selected cache headers', () => {
	const response = {
		statusCode: 0,
		setHeader: vi.fn(),
		end: vi.fn()
	} as unknown as ServerResponse;

	sendJson(response, 200, { plugins: [] }, 'public, max-age=300');

	expect(response.statusCode).toBe(200);
	expect(response.setHeader).toHaveBeenCalledWith(
		'content-type',
		'application/json; charset=utf-8'
	);
	expect(response.setHeader).toHaveBeenCalledWith('cache-control', 'public, max-age=300');
	expect(response.end).toHaveBeenCalledWith('{"plugins":[]}');
});
