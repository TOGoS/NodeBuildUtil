"use strict";

let _FSUtil = require('./FSUtil');
let _Logger = require('./Logger');

module.exports = (() => {

/**
 * A minimal implementation of Builder
 * that works well enough to build itself.
 */
const Builder = function() {
	this.processName = 'build.js';
	this.targets = {};
	this.logger = _Logger.NULL_LOGGER;

	this.buildTargetNames = [];
	this.buildPromises = {};
	this.operation = 'build';
	this.verbosity = 100;
}
Object.defineProperty(Builder.prototype, 'externalProcessRunner', {
	get: function() {
		if( this._externalProcessRunner == undefined ) {
			let ExternalProcessRunner = require('./ExternalProcessRunner').default;
			this._externalProcessRunner = new ExternalProcessRunner();
			this._externalProcessRunner.logger = this.logger;
		}
		return this._externalProcessRunner;
	}
});
Object.defineProperty(Builder.prototype, 'fsUtil', {
	get: function() {
		return require('./FSUtil');
	}
});
Builder.prototype.node = function(argv) {
	return this.externalProcessRunner.node(argv);
};
Builder.prototype.npm = function(argv) {
	return this.externalProcessRunner.npm(argv);
};
Builder.prototype.processArgv = function(argv) {
	for( let a=0; a<argv.length; ++a ) {
		let arg = argv[a];
		if( arg.length == 0 ) {
			return Promise.reject(new Error("Weird zero-length argument at argv["+a+"]"));
		} else if( arg[0] != '-' ) {
			this.buildTargetNames.push(arg);
		} else if( arg == '--list-targets' ) {
			this.operation = 'list-targets';
		} else if( arg == '-v' ) {
			this.verbosity = 200;
			this.logger = console;
		} else {
			return Promise.reject(new Error("Unrecognized argument: "+arg));
		}
	}
	if( this.buildTargetNames.length == 0 ) {
		this.buildTargetNames.push('default');
	}
	return Promise.resolve();
};
Builder.prototype._build = function(targetName) {
	let targ = this.targets[targetName];
	if( targ == undefined ) {
		// Then just make sure it exists
		return _FSUtil.stat(targetName);
	}

	let prom = Promise.resolve();
	if( targ.prereqs ) for( let p in targ.prereqs ) {
		prom = prom.then( () => this.build(targ.prereqs[p]) );
	}
	if( targ.invoke ) prom = prom.then( () => targ.invoke({
		builder: this
	}));
	return prom;
}
Builder.prototype.build = function(targetName) {
	if( this.buildPromises[targetName] ) return this.buildPromises[targetName];
	return this.buildPromises[targetName] = this._build(targetName);
};
Builder.prototype.run = function() {
	if( this.operation == 'list-targets' ) {
		for( let t in this.targets ) {
			console.log(t);
		}
		return Promise.resolve();
	}

	if( this.verbosity >= 200 ) {
		console.log("Building using bootstrap builder.");
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
Builder.prototype.processArgvAndBuild = function(argv) {
	return this.processArgv(argv).then( () => this.run() );
}

Builder.default = Builder;
return Builder;

})();
