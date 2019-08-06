#!/usr/bin/env node
"use strict";

let _Builder;
let _FSUtil;

try {
	_Builder = require('./target/cjs/Builder');
} catch( err ) {
	_Builder = require('./src/bootstrap/js/Builder');
}

try {
	_FSUtil = require('./target/cjs/FSUtil');
} catch( err ) {
	_FSUtil = require('./src/bootstrap/js/FSUtil');
}

let bb = new (_Builder.default)();

bb.globalPrereqs = ['build.js'];
bb.targets = {
	'node_modules': {
		description: "The place where NPM puts modules.",
		invoke: (ctx) => {
			return _FSUtil.stat('node_modules/typescript/bin/tsc').catch( (err) => {
				return ctx.builder.npm(['install']);
			}).then( () => {
				return _FSUtil.stat('node_modules/typescript/bin/tsc');
			});
		},
		isDirectory: true,
	},
	'target/cjs': {
		description: "Compiled JavaScript ends up in here.",
		prereqs: ['node_modules','src/main'],
		invoke: (ctx) => {
			return ctx.builder.node(['node_modules/typescript/bin/tsc','-p','src/main/ts/cjs.es5.tsconfig.json']);
		},
		isDirectory: true,
	},
	'clean': {
		description: "Remove generated files",
		invoke: (ctx) => {
			return _FSUtil.rmRf(['node_modules','target']);
		}
	},
	'default': {
		prereqs: ['target/cjs']
	},
	'run-unit-tests': {
		prereqs: ['target/cjs'],
		invoke: (ctx) => {
			return ctx.builder.runUnitTests("target/cjs")
		}
	}
};

bb.processArgvAndBuild(process.argv.slice(2)).catch( (err) => {
	console.error(bb.processName+": Error: "+err.stack);
	process.exitCode = 1;
});
