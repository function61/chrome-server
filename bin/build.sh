#!/bin/bash -eu

function installPackageJsonModules {
	npm install --no-bin-links --production
}

function truncateReleasesDirectory {
	rm -rf rel/

	mkdir -p rel/
}

function packageLambdaFunction {
	zip -qr "rel/lambdafunc.zip" index.js node_modules/
}


installPackageJsonModules

truncateReleasesDirectory

packageLambdaFunction
