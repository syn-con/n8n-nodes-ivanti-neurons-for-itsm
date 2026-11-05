/* eslint-disable @n8n/community-nodes/no-restricted-imports -- tests are not published, so they may use the Node test runner */
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';

import { execute as readAttachment } from '../nodes/IvantiNeuronsForITSM/actions/attachment/readAttachment.operation';
import { parseContentDispositionFilename } from '../nodes/IvantiNeuronsForITSM/common';
import { fakeExecuteContext, type FakeResponse } from './context';

const ATTACHMENT_ID = '07E1BD1BF5804E67B8E76B26FA6EF9A0';

const download = (content: string, contentDisposition?: string): FakeResponse => ({
	statusCode: 200,
	body: Readable.from([Buffer.from(content)]),
	headers: {
		'content-type': 'application/pdf',
		...(contentDisposition ? { 'content-disposition': contentDisposition } : {}),
	},
});

describe('parseContentDispositionFilename', () => {
	for (const [header, expected] of [
		['attachment; filename="report.pdf"', 'report.pdf'],
		['attachment; filename=report.pdf', 'report.pdf'],
		['attachment; filename="a.pdf"; size=1', 'a.pdf'],
		['attachment; filename=a.pdf; size=1', 'a.pdf'],
		['attachment; filename="semi;colon \\"quoted\\".txt"', 'semi;colon "quoted".txt'],
		["attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf", 'résumé.pdf'],
		["attachment; filename=\"resume.pdf\"; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf", 'résumé.pdf'],
		["attachment; FILENAME*=utf-8'en'na%C3%AFve.txt", 'naïve.txt'],
		["attachment; filename*=iso-8859-1''caf%E9.txt", 'café.txt'],
		["attachment; filename*=UTF-8''%E0%A4%A; filename=fallback.txt", 'fallback.txt'],
		['attachment; filename="../../etc/passwd"', 'passwd'],
		['attachment; filename="C:\\\\temp\\\\x.txt"', 'x.txt'],
		['inline', undefined],
		['attachment; filename=""', undefined],
		[undefined, undefined],
	] as const) {
		it(`reads ${JSON.stringify(header)}`, () => {
			assert.equal(parseContentDispositionFilename(header), expected);
		});
	}
});

describe('Attachment > Read', () => {
	it('keeps the input binary fields beside the downloaded file', async () => {
		const photo = { data: 'cGhvdG8=', mimeType: 'image/png', fileName: 'photo.png' };
		const { ctx } = fakeExecuteContext({
			inputItems: [{ json: { ticket: 1 }, binary: { photo } }],
			parameters: { attachmentId: ATTACHMENT_ID },
			responses: [download('%PDF', "attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf")],
		});

		const [item] = await readAttachment.call(ctx);

		assert.deepEqual(item.json, { ticket: 1 });
		assert.deepEqual(item.pairedItem, { item: 0 });
		assert.deepEqual(Object.keys(item.binary ?? {}).sort(), ['data', 'photo']);
		assert.deepEqual(item.binary?.photo, photo);
		assert.equal(item.binary?.data.fileName, 'résumé.pdf');
		assert.equal(Buffer.from(item.binary?.data.data ?? '', 'base64').toString(), '%PDF');
	});

	it('writes the file to the field named in Put Output File in Field', async () => {
		const { ctx } = fakeExecuteContext({
			parameters: { attachmentId: ATTACHMENT_ID, binaryPropertyName: ' invoice ' },
			responses: [download('x', 'attachment; filename="a.pdf"; size=1')],
		});

		const [item] = await readAttachment.call(ctx);

		assert.deepEqual(Object.keys(item.binary ?? {}), ['invoice']);
		assert.equal(item.binary?.invoice.fileName, 'a.pdf');
	});

	it('streams the download instead of reading it into memory first', async () => {
		const { ctx, requests, binaries } = fakeExecuteContext({
			parameters: { attachmentId: ATTACHMENT_ID },
			responses: [download('x')],
		});

		await readAttachment.call(ctx);

		assert.equal(requests[0].encoding, 'stream');
		assert.equal(binaries[0].streamed, true);
		assert.equal(binaries[0].filePath, 'unknown');
		assert.equal(binaries[0].mimeType, 'application/pdf');
	});

	it('passes 100 MB through without collecting it', async () => {
		const chunk = Buffer.alloc(1024 * 1024);
		let sent = 0;
		const body = Readable.from(
			(function* () {
				for (let i = 0; i < 100; i++) {
					sent += chunk.length;
					yield chunk;
				}
			})(),
		);
		const { ctx } = fakeExecuteContext({
			parameters: { attachmentId: ATTACHMENT_ID },
			responses: [{ statusCode: 200, body, headers: {} }],
		});
		// Count the bytes as n8n's binary store would, without keeping them.
		let received = 0;
		ctx.helpers.prepareBinaryData = async (data) => {
			assert.ok(data instanceof Readable, 'the body must reach prepareBinaryData as a stream');
			for await (const part of data) received += (part as Buffer).length;
			return { data: '', mimeType: 'application/octet-stream' };
		};

		await readAttachment.call(ctx);

		assert.equal(received, 100 * 1024 * 1024);
		assert.equal(sent, received);
	});

	it('refuses an empty output field name', async () => {
		const { ctx, requests } = fakeExecuteContext({
			parameters: { attachmentId: ATTACHMENT_ID, binaryPropertyName: '  ' },
		});

		await assert.rejects(readAttachment.call(ctx), /"Put Output File in Field" parameter is required/);
		assert.equal(requests.length, 0);
	});
});
