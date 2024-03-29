⬆️ For table of contents, click the above icon

![Build status](https://github.com/function61/chrome-server/workflows/Build/badge.svg)
[![Download](https://img.shields.io/github/downloads/function61/chrome-server/total.svg?style=for-the-badge)](https://github.com/function61/chrome-server/releases)

Chrome automation microservice for AWS Lambda with an HTTP API, automatic screenshotting
on errors and file upload support.

![](docs/drawing.png)


Installation
------------

Just plop the `lambdafunc.zip` from the download link into AWS Lambda.

Then set up AWS API Gateway or [Edgerouter](https://github.com/function61/edgerouter) as
the HTTP ingress.

Our [base project](https://github.com/alixaxel/chrome-aws-lambda) recommends allocating at
least 1 600 MB RAM. You know the
[memes about Chrome and RAM](https://knowyourmeme.com/memes/google-chrome-ram-hog)..

You should also increase timeout in Lambda from default. I used 2 minutes for timeout but
your needs may vary.


Minimal test example
--------------------

Save as `script.js`:

```javascript
exports.handler = async (ctx, console, browser) => {
	console.log('example log message')

	ctx.data = {
		message: 'hello world',
	};
}

```

Now run the `$ curl` command (from "How to submit jobs"). You should see this:

```console
$ curl ...
{
  "logMessages": [
    "example log message"
  ],
  "errorMessages": [],
  "data": {
    "message": "hello world"
  },
  "error": null
}
```

Now let's actually do something with Chrome. Modify `script.js`:

```javascript
exports.handler = async (ctx, console, browser) => {
	const page = await browser.newPage();

	await page.goto('https://www.reddit.com/');

	ctx.data = {
		title: await page.title(),
	};
}
```

Running it:

```console
$ curl ...
{
  "logMessages": [],
  "errorMessages": [],
  "data": {
    "title": "reddit: the front page of the internet"
  },
  "error": null
}
```


How to submit jobs
------------------

### Use from Go

There is a small [Go-based client](./pkg/chromeserverclient/) available.


### curl

Example with `curl` and authorization (you can use anything as token, if you haven't set
up authorization):

```console
$ curl --data-binary "@script.js" -H 'Authorization: Bearer ...' -H 'Content-Type: application/javascript' https://example.com/api/chromeserver/job
```


Sending parameters to the script
--------------------------------

Since you're sending the script, in theory you could replace placeholders from the script,
but that's ugly.

Any URL parameters like `POST /api/chromeserver/job?msg=foo` will be available at `ctx.params.msg`


Automatic screenshotting on errors
----------------------------------

This isn't enabled by default, but you've to add `errorAutoScreenshot=1` URL parameter.

If your script run throws an exception a screenshot will be taken, saved to S3 and URL
to it will be returned along with your error.


File uploads
------------

If your script run produces much data (like files) to not like returning them in
the response JSON, you can call `ctx.uploadFile()` to have files uploaded to S3. The
function returns URL to the file, which you can return with your JSON.


Setting up for screenshots and file uploads
-------------------------------------------

You need to have a S3 bucket, and define that as `S3_BUCKET` ENV variable for your Lambda.

We recommend you to set up automatic expiration for a specific directory prefix like
`temp-7d/` to delete files in 7 days.

We recommend you don't give your Lambda full S3 access, not even to said bucket but only
for a subdirectory. Here's an example policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:PutObjectAcl"
            ],
            "Resource": [
                "arn:aws:s3:::YOUR-BUCKET_NAME/temp-7d/chrome-server/*"
            ]
        }
    ]
}
```


Local automation script dev
---------------------------

When developing a complex script, it's very useful to be able to test it locally (think:
getting screenshots when you encounter an error).

First, meet [Turbo Bob](https://github.com/function61/turbobob/blob/master/docs/external-how-to-build-and-dev.md).

Then:

- enter dev container
- test your script

It looks like this:

```console
$ bob dev
$ ./devrunner.js script.js
{
  logMessages: [],
  errorMessages: [],
  data: { title: 'reddit: the front page of the internet' },
  error: null
}
```

(if it complains about `$ npm install`, run it)

The `devrunner.js` gives you same output as you would get from Lambda over HTTP.

Note: after doing local dev, if you build `chrome-server`, your `lambdafunc.zip` will be
larger (and above the Lambda's limit) because of additional `node_modules`. But usually
you won't develop your job scripts and **change** `chrome-server` at the same time. :)


Security
--------

Since this service evaluates user-sent JavaScript, you need to trust the API users.

Have the API be protected via authorization in AWS's API Gateway or in
[Edgerouter](https://github.com/function61/edgerouter).

Don't give the Lambda function any privileges beyond what is needed to do its job:

- run Lambda
- upload data to S3 to a restricted path within the bucket


Credits
-------

This is a small decoration on top of
[alixaxel/chrome-aws-lambda](https://github.com/alixaxel/chrome-aws-lambda). He's done
amazing work!
