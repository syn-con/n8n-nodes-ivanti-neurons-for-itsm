/* eslint-disable @n8n/community-nodes/no-restricted-imports -- tests are not published, so they may use the Node test runner */
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import { NodeApiError } from 'n8n-workflow';

import { execute as readAttachment } from '../nodes/IvantiNeuronsForITSM/actions/attachment/readAttachment.operation';
import { ivantiApiRequest, ivantiApiRequestFormData } from '../nodes/IvantiNeuronsForITSM/transports';
import { fakeExecuteContext } from './context';

const ATTACHMENT_ID = '07E1BD1BF5804E67B8E76B26FA6EF9A0';

const ism4000 = JSON.stringify({
	code: 'ISM_4000',
	description: 'Bad Request',
	message: ['Attachment with ID 07E1BD1BF5804E67B8E76B26FA6EF9A0 was not found'],
});

/** Asserts a NodeApiError with this HTTP code and message. */
const apiError = (httpCode: string, message: string) => (error: unknown) => {
	assert.ok(error instanceof NodeApiError, `expected a NodeApiError, got ${String(error)}`);
	assert.equal(error.httpCode, httpCode);
	assert.equal(error.message, message);
	return true;
};

describe('Attachment > Read errors', () => {
	const notFound = () => ({
		statusCode: 400,
		body: Readable.from([Buffer.from(ism4000)]),
		headers: { 'content-type': 'application/json' },
	});

	it("fails with Ivanti's ISM_4000 message and HTTP 400", async () => {
		const { ctx, requests } = fakeExecuteContext({
			parameters: { attachmentId: ATTACHMENT_ID },
			responses: [notFound()],
		});

		await assert.rejects(
			readAttachment.call(ctx),
			apiError(
				'400',
				'Ivanti API request failed (HTTP 400, ISM_4000): Attachment with ID 07E1BD1BF5804E67B8E76B26FA6EF9A0 was not found',
			),
		);
		assert.equal(requests[0].ignoreHttpStatusErrors, true);
	});

	it('returns the message and HTTP code on the item with Continue On Fail', async () => {
		const { ctx } = fakeExecuteContext({
			continueOnFail: true,
			parameters: { attachmentId: ATTACHMENT_ID },
			responses: [notFound()],
		});

		const [item] = await readAttachment.call(ctx);

		assert.equal(item.json.httpCode, '400');
		assert.match(String(item.json.error), /HTTP 400, ISM_4000\): Attachment with ID/);
		assert.deepEqual(item.pairedItem, { item: 0 });
	});

	it('reads at most 64 KB of a long error reply and shortens the message', async () => {
		let sent = 0;
		const body = Readable.from(
			(function* () {
				for (let i = 0; i < 50; i++) {
					sent += 4096;
					yield Buffer.alloc(4096, 'x');
				}
			})(),
		);
		const { ctx } = fakeExecuteContext({
			parameters: { attachmentId: ATTACHMENT_ID },
			responses: [{ statusCode: 500, body }],
		});

		await assert.rejects(readAttachment.call(ctx), (error: unknown) => {
			assert.ok(error instanceof NodeApiError);
			assert.equal(error.httpCode, '500');
			assert.equal(error.message, `Ivanti API request failed (HTTP 500): ${'x'.repeat(500)}…`);
			return true;
		});
		assert.ok(sent < 50 * 4096, `the rest of the reply must not be read (read ${sent} bytes)`);
	});
});

describe('Attachment upload errors', () => {
	it('lists the reason of each refused file (HTTP 300, ISM_3000)', async () => {
		const { ctx, requests } = fakeExecuteContext({
			responses: [
				{
					statusCode: 300,
					body: JSON.stringify({
						Code: 'ISM_3000',
						Description: 'Validation Error',
						Message: [
							{ FileName: 'setup.exe', IsUploaded: false, Message: 'The file type is not allowed' },
							{ FileName: 'notes.pdf', IsUploaded: true, Message: '' },
							{ FileName: 'big.zip', IsUploaded: false, Message: 'The file is too large' },
						],
					}),
				},
			],
		});

		await assert.rejects(
			ivantiApiRequestFormData.call(ctx, 'POST', '/rest/Attachment', new FormData()),
			apiError(
				'300',
				'Ivanti API request failed (HTTP 300, ISM_3000): setup.exe: The file type is not allowed; big.zip: The file is too large',
			),
		);
		assert.equal(requests[0].ignoreHttpStatusErrors, true);
	});
});

describe('Error message', () => {
	const failWith = async (statusCode: number, body: unknown) => {
		const { ctx } = fakeExecuteContext({ responses: [{ statusCode, body }] });
		return ivantiApiRequest.call(ctx, 'GET', '/rest/Search');
	};

	it("includes Ivanti's code and puts the reply in the description", async () => {
		await assert.rejects(failWith(400, ism4000), (error: unknown) => {
			assert.ok(error instanceof NodeApiError);
			assert.match(error.message, /^Ivanti API request failed \(HTTP 400, ISM_4000\): Attachment with ID/);
			assert.equal(error.description, `Ivanti replied: ${JSON.stringify(JSON.parse(ism4000))}`);
			return true;
		});
	});

	it('uses the description when the reply has no message', async () => {
		await assert.rejects(
			failWith(403, '{"code":"ISM_4030","description":"Forbidden"}'),
			apiError('403', 'Ivanti API request failed (HTTP 403, ISM_4030): Forbidden'),
		);
	});

	it('shows a plain-text reply as it is', async () => {
		await assert.rejects(
			failWith(502, 'Bad Gateway\n'),
			apiError('502', 'Ivanti API request failed (HTTP 502): Bad Gateway'),
		);
	});

	it('says only the status for an empty reply', async () => {
		await assert.rejects(failWith(401, ''), apiError('401', 'Ivanti API request failed (HTTP 401)'));
	});
});
