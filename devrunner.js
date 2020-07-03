#!/usr/bin/env node

const index = require('./index');
const fs = require('fs');

async function dev() {
	const ctx = new index.JobContext();

	const result = await index.runJob(
		fs.readFileSync(process.argv[2]),
		ctx);

	console.log(result);
}

dev();
