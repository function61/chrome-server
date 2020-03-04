const chromium = require('chrome-aws-lambda');
const crypto = require('crypto');
const fs = require('fs');
const util = require('util');

const writeFile = util.promisify(fs.writeFile);
const unlink = util.promisify(fs.unlink);

class JobContext {
	logMessages = [];
	errorMessages = [];
	data = null;
	err = null;

	// this can be used as console.log() in job
	log(msg) {
		this.logMessages.push(msg);
		console.log(msg);
	}

	error(msg) {
		this.errorMessages.push(msg);
		console.error(msg);
	}
}

exports.runJob = async (jobScript) => {
	const jobCtx = new JobContext();

	let browser = null;

	const jobFilename = '/tmp/' + crypto.randomBytes(8).toString('hex') + '.js';

	await writeFile(jobFilename, jobScript);

	try {
		browser = await chromium.puppeteer.launch({
			args: chromium.args,
			defaultViewport: chromium.defaultViewport,
			executablePath: await chromium.executablePath,
			headless: true,
			// headless: chromium.headless, // this will be false on local without display
		});

		const job = require(jobFilename);

		try {
			await job.handler(jobCtx, jobCtx, browser);
		} catch (err) {
			jobCtx.err = err.toString();
		}
	} catch (err) {
		jobCtx.err = "error loading job: " + err.toString();
	} finally {
		if (browser) {
			await browser.close();
		}

		await unlink(jobFilename);
	}

	const result = {
		logMessages: jobCtx.logMessages,
		errorMessages: jobCtx.errorMessages,
		data: jobCtx.data,
		error: jobCtx.err,
	}

	return result;
}

exports.handler = async (event, context) => {
	if (event.httpMethod !== 'POST') {
		return badRequest(`Invalid method: ${event.httpMethod}`);
	}

	if (event.path !== '/job') {
		return badRequest(`Invalid path: ${event.path}`);
	}

	if (event.headers['Content-Type'] !== 'application/javascript') {
		return badRequest('Expecting application/javascript Content-Type');
	}

	const jobScript = event.isBase64Encoded ?
		Buffer.from(event.body, 'base64').toString('utf-8') :
		event.body;

	const result = await exports.runJob(jobScript);

	return succeedJson(result);
};

function badRequest(text) {
	return {
		statusCode: 400,
		headers: {
			'Content-Type': 'text/plain',
		},
		body: text,
	};
}

function succeedJson(payload) {
	return {
		statusCode: 200,
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(payload, null, '  '),
	};
}
