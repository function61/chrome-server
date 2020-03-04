#!/usr/bin/env node

const index = require('./index');
const fs = require('fs');

async function dev() {
	const result = await index.runJob(fs.readFileSync(process.argv[2]));

	console.log(result);
}

dev();
