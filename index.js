const chromium = require('chrome-aws-lambda');
const crypto = require('crypto');
const fs = require('fs');
const util = require('util');
const aws = require('aws-sdk');

const s3 = new aws.S3();

const writeFile = util.promisify(fs.writeFile);
const unlink = util.promisify(fs.unlink);

class JobContext {
	// for when you need a FS-safe ID for your job. is automatically used to partition
	// uploaded files as well
	invocationId = randomInvocationId();
	logMessages = [];
	errorMessages = [];
	params = {}; // query params
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

	// returns URL to the created file
	async uploadFile(name, payload, contentType) {
		const bucket = process.env.S3_BUCKET;
		if (!bucket) {
			throw new Error("S3_BUCKET not defined");
		}

		const fullKey = `temp-7d/chrome-server/${this.invocationId}/${name}`;

		await s3.putObject({
			Bucket: bucket,
			Key: fullKey,
			Body: payload,
			ContentType: contentType,
		}).promise();

		return `https://s3.amazonaws.com/${bucket}/${fullKey}`;
	}
}

exports.JobContext = JobContext;

exports.runJob = async (jobScript, jobCtx) => {
	let browser = null;

	const jobFilename = '/tmp/' + jobCtx.invocationId + '.js';

	await writeFile(jobFilename, jobScript);

	let errorAutoScreenshotUrl;

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
			const pages = await browser.pages();

			if (jobCtx.params && 'errorAutoScreenshot' in jobCtx.params && pages.length > 0) {
				const screenshot = await pages[pages.length - 1].screenshot({ type: 'png' });
				const screenshotUrl = await jobCtx.uploadFile('error_screenshot.png', screenshot, 'image/png');

				errorAutoScreenshotUrl = screenshotUrl;
			}

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
		errorAutoScreenshotUrl: errorAutoScreenshotUrl,
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

	const jobCtx = new JobContext();
	jobCtx.params = event.queryStringParameters;

	const jobScript = event.isBase64Encoded ?
		Buffer.from(event.body, 'base64').toString('utf-8') :
		event.body;

	const result = await exports.runJob(jobScript, jobCtx);

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

// also adds timestamp in front so that if you search the run outputs in S3, you'll get
// a nice chronologically ordered folder structure
function randomInvocationId() {
	// looks like "2020-07-04T18-37-00.317e0293"
	return new Date().toISOString().replace(/:/g, '-').substr(0, 20) + crypto.randomBytes(4).toString('hex');
}
