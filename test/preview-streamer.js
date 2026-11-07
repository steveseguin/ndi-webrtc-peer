'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Exercise the distributed implementation without starting FFmpeg or NDI.
const sourcePath = process.argv[2] || path.join(__dirname, '../dist/PreviewStreamer.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function createStreamer(config) {
	const outputs = [];
	const command = { runs: 0, outputs };
	for (const method of [
		'setFfmpegPath', 'input', 'inputFormat', 'inputOptions',
		'addOutputOptions', 'addOutputOption', 'withNoAudio', 'withNoVideo',
		'withSize', 'audioCodec', 'addListener', 'removeAllListeners', 'kill',
	]) {
		command[method] = () => command;
	}
	command.output = url => {
		outputs.push({ url });
		return command;
	};
	command.outputFormat = format => {
		outputs[outputs.length - 1].format = format;
		return command;
	};
	command.run = () => { command.runs++; };
	const module = { exports: {} };
	const dependencies = {
		'./Logger': { ndiLogger: { info() {}, warn() {}, debug() {}, error() {} } },
		'fluent-ffmpeg': () => command,
		'os': { hostname: () => 'test-host' },
		'./RetryWithTimeout': { RetryWithTimeout: class { reset() {} } },
		'./NDI': {
			isNativeCodePackaged: () => false,
			getPackagedFFMpegName: () => 'unused-ffmpeg',
		},
	};
	vm.runInNewContext(source, {
		exports: module.exports,
		module,
		require(name) {
			assert(Object.prototype.hasOwnProperty.call(dependencies, name), name);
			return dependencies[name];
		},
	}, { filename: sourcePath });
	return { streamer: new module.exports.PreviewStreamer(config, 'test'), command };
}

const cases = [
	['audio-only HTTP', undefined, 'http://localhost:8080/audio', undefined, 'mpegts'],
	['audio-only HTTPS', undefined, 'https://localhost:8080/audio', undefined, 'mpegts'],
	['audio-only RTP', undefined, 'rtp://localhost:5004', undefined, 'rtp'],
	['HTTP video and RTP audio', 'http://localhost:8080/video', 'rtp://localhost:5004', 'mpegts', 'rtp'],
	['RTP video and HTTP audio', 'rtp://localhost:5006', 'http://localhost:8080/audio', 'rtp', 'mpegts'],
	['HTTP video and HTTP audio', 'http://localhost:8080/video', 'http://localhost:8080/audio', 'mpegts', 'mpegts'],
	['RTP video and RTP audio', 'rtp://localhost:5006', 'rtp://localhost:5004', 'rtp', 'rtp'],
	['video-only HTTP', 'http://localhost:8080/video', undefined, 'mpegts', undefined],
	['video-only RTP', 'rtp://localhost:5006', undefined, 'rtp', undefined],
];

let failures = 0;
for (const [name, videoUrl, audioUrl, videoFormat, audioFormat] of cases) {
	try {
		const { streamer, command } = createStreamer({ videoUrl, audioUrl });
		streamer.spawn();
		const expected = [];
		if (videoUrl) expected.push({ url: videoUrl, format: videoFormat });
		if (audioUrl) expected.push({ url: audioUrl, format: audioFormat });
		assert.deepStrictEqual(command.outputs, expected);
		assert.strictEqual(command.runs, 1);
		streamer.spawn();
		assert.strictEqual(command.runs, 1, 'repeated spawn must remain a no-op');
		streamer.destroy();
		console.log('PASS ' + name);
	} catch (error) {
		failures++;
		console.error('FAIL ' + name + ': ' + error.message);
	}
}

if (failures) process.exitCode = 1;
