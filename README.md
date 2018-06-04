## NodeBuildUtil

A Make-like build system written in Typescript.

Intended to be embedded directly into your project
(as opposed to being referenced as an externaly dependency)
so that it can be used to bootstrap the build process,
including running any package managers.

Like Make, supports both file-based tasks (whose timestamps are taken into account before rebuilding)
and 'phony' ones.  In addition, NodeBuildUtil natively understands directories
as prerequisites, recursing into them to find the latest modification time
in order to determine if a dependent needs to be rebuilt.

Targets' build rules are Javascript functions that return promises.


### Usage

Copy files in ```NodeBuildUtil/src/main/js/``` to a folder in your project;
conventionally ```YourProject/src/build/js/```.

Create a ```build.js``` with rules for building your various targets.
This can reference the builder classes like so:

```javascript
let _Builder;
let _FSUtil;

_Builder = require('./src/build/js/Builder');
_FSUtil = require('./src/build/js/FSUtil');
```

Add some boilerplate setup code to build.js:

```javascript
let bb = new (_Builder.default)();

bb.globalPrereqs = ['build.js']; // If build.js changes, err on the side of rebuilding things
```

Define your build targets.
For example:

```javascript
bb.targets = {
	"clean": {
		invoke: (ctx) => {
			return _FSUtil.rmRf(["some-file.html"]);
		}
	},
	"some-file.html": {
		isFile: true, // i.e. not what Make calls a 'phony' target
		invoke: (ctx) => {
			return _FSUtil.readFile("some-file.html.template").then( (template) => {
				// Simple, contrived build rule
				return template.replace('{var}', 42);
			}).then( (text) => {
				return _FSUtil.writeFile("some-file.html", text);
			});
		}
		
	},
	"default": { // The rule that gets run if you just 'node build.js' is called 'default'
		"prereqs": ["some-file.html"]
	}
}
```

Some commonly-used build rules are to invoke npm to create/update ```node_modules``` and
to invoke the TypeScript compiler to turn a folder full of TypeScript files into JavaScript.
This project's own (build.js)[build.js] provides examples of both.

Add more boilerplate to kick off the process when build.js is executed:

```javascript
bb.processArgvAndBuild(process.argv.slice(2)).catch( (err) => {
	console.error(bb.processName+": Error: "+err.stack);
	process.exitCode = 1;
});
```


### Calling from Make

If you want to pretend to be using Make, but have it actually delegate everything to your build.js,
create a Makefile like so:

```Makefile
define generate_targets
TARGETS := $(shell node build.js --list-targets)

.PHONY: $$(TARGETS)

$$(TARGETS):
	node build.js $(MAKECMDGOALS)
endef

$(eval $(call generate_targets))
```


### Building

This project is self-hosting, by which I mean it uses itself to build itself.
If you make changes to this project's TypeScript, run:

```sh
node build.js
```

When you're done, commit both the TypeScript changes and the
built files in ```src/bootstrap/js```.
