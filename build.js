#!/usr/bin/env node
"use strict";

const BuilderBuilder = function() {
	this.processName = 'build.js';
	this.buildTargetNames = [];
	this.buildPromises = {};
	this.operation = 'build';
}
Object.defineProperty(BuilderBuilder.prototype, 'externalProcessRunner', {
	get: function() {
		if( this._externalProcessRunner == undefined ) {
			let ExternalProcessRunner = require('./src/bootstrap/js/ExternalProcessRunner').default;
			this._externalProcessRunner = new ExternalProcessRunner();
		}
		return this._externalProcessRunner;
	}
});
Object.defineProperty(BuilderBuilder.prototype, 'fsUtil', {
	get: function() {
		return require('./src/bootstrap/js/FSUtil');
	}
});
BuilderBuilder.prototype.processArgv = function(argv) {
	this.processName = argv[1];
	for( let a=2; a<argv.length; ++a ) {
		let arg = argv[a];
		if( arg.length == 0 ) {
			return Promise.reject(new Error("Weird zero-length argument at argv["+a+"]"));
		} else if( arg[0] != '-' ) {
			this.buildTargetNames.push(arg);
		} else if( arg == '--list-targets' ) {
			this.operation = 'list-targets';
		} else {
			return Promise.reject(new Error("Unrecognized argument: "+arg));
		}
	}
	return Promise.resolve();
};
BuilderBuilder.prototype._build = function(targetName) {
	if( targetName == 'install-tsc' ) {
		return this.fsUtil.stat('node_modules/typescript/bin/tsc').catch( (err) => {
			return this.externalProcessRunner.npm(['install']);
		}).then( () => {
			return this.fsUtil.stat('node_modules/typescript/bin/tsc');
		});
	}
	
	if( targetName == 'build' ) {
		return this.build('install-tsc').then( () => {
			return this.externalProcessRunner.node(['node_modules/typescript/bin/tsc','-p','src/main/ts/cjs.es5.tsconfig.json']);
		})
	};

	return Promise.reject("Unknown build target: '"+targetName+"'");
}
BuilderBuilder.prototype.build = function(targetName) {
	if( this.buildPromises[targetName] ) return this.buildPromises[targetName];
	return this.buildPromises[targetName] = this._build(targetName);
};
BuilderBuilder.prototype.run = function() {
	if( this.operation == 'list-targets' ) {
		console.log("build");
		console.log("install-tsc");
		return Promise.resolve();
	}

	if( this.buildTargetNames.length == 0 ) {
		console.log("Warning: No build targets");
	}
	let buildPromise = Promise.resolve();
	for( let t in this.buildTargetNames ) {
		buildPromise = buildPromise.then( () => this.build(this.buildTargetNames[t]));
	}
	return buildPromise;
};

let bb = new BuilderBuilder();
bb.processArgv(process.argv).then( () => {
	return bb.run();
}).catch( (err) => {
	console.error(bb.processName+": Error: "+err.stack);
	process.exitCode = 1;
});
