"use strict";
// This file is maintained as part of NodeBuildUtil: https://github.com/TOGoS/NodeBuildUtil
// If you're making fixes and want to make sure they get merged upstream,
// PR to that project.
// Otherwise, feel free to remove this comment.
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var fsutil = require("./FSUtil");
var Logger_1 = require("./Logger");
var ExternalProcessRunner_1 = require("./ExternalProcessRunner");
var mtimeR = fsutil.mtimeR;
var rmRf = fsutil.rmRf;
/**
 * Escape program arguments to represent as a command
 * that could be run at the shell.
 * For displaying to humans.
 * Don't actually run at the shell because escaping is probably imperfect.
 */
function argsToShellCommand(args) {
    if (typeof args === 'string')
        return args;
    var escaped = [];
    for (var i in args) {
        var arg = args[i];
        if (arg.match(/^[a-zA-Z0-9\/\.\+_\-]+$/))
            escaped.push(arg);
        else
            escaped.push('"' + arg.replace(/["\$\\]/g, '\\$&') + '"');
    }
    return escaped.join(' ');
}
function toSet(arr, into) {
    if (into == undefined)
        into = {};
    for (var x in arr)
        into[arr[x]] = arr[x];
    return into;
}
var Builder = /** @class */ (function () {
    function Builder(targets) {
        if (targets === void 0) { targets = {}; }
        this.targets = targets;
        /**
         * List of things to always consider prereqs,
         * such as the build script itself.
         */
        this.globalPrereqs = [];
        this.logger = Logger_1.NULL_LOGGER;
        this.buildPromises = {};
        this.epr = new ExternalProcessRunner_1.default();
        this.allTargetsPromise = undefined;
    }
    Builder.prototype.touch = function (fileOrDir) {
        this.logger.log("Touching " + fileOrDir);
        var curTime = Date.now() / 1000;
        return new Promise(function (resolve, reject) {
            fs.utimes(fileOrDir, curTime, curTime, function (err) {
                if (err)
                    return reject(err);
                else
                    resolve();
            });
        });
    };
    ;
    Builder.prototype.doCmd = function (args, opts) {
        if (opts === void 0) { opts = {}; }
        return this.epr.doCmd(args, opts);
    };
    Builder.prototype.npm = function (args, opts) {
        if (opts === void 0) { opts = {}; }
        return this.epr.npm(args, opts);
    };
    Builder.prototype.node = function (args, opts) {
        if (opts === void 0) { opts = {}; }
        return this.epr.node(args, opts);
    };
    Builder.prototype.tsc = function (args, opts) {
        if (opts === void 0) { opts = {}; }
        return this.epr.tsc(args, opts);
    };
    Builder.prototype.fetchGeneratedTargets = function () { return Promise.resolve({}); };
    ;
    Builder.prototype.fetchAllTargets = function () {
        if (this.allTargetsPromise)
            return this.allTargetsPromise;
        var allTargets = {};
        for (var n in this.targets)
            allTargets[n] = this.targets[n];
        return this.allTargetsPromise = this.fetchGeneratedTargets().then(function (generatedTargets) {
            for (var n in generatedTargets)
                allTargets[n] = generatedTargets[n];
            return allTargets;
        });
    };
    Builder.prototype.fetchTarget = function (targetName) {
        return this.fetchAllTargets().then(function (targets) { return targets[targetName]; });
    };
    Builder.prototype.getTargetPrereqSet = function (target) {
        var set = {};
        if (target.prereqs)
            toSet(target.prereqs, set);
        if (target.getPrereqs)
            toSet(target.getPrereqs(), set);
        toSet(this.globalPrereqs, set);
        return set;
    };
    Builder.prototype.runUnitTests = function (dir) {
        var _this = this;
        return fsutil.walkDir(dir, function (path) {
            if (/.*[Tt]est\.js$/.exec(path)) {
                return _this.doCmd(["node", path]).then(function (result) {
                    _this.logger.log(path + " ran successfully");
                }, function (err) {
                    _this.logger.error(path + " failed: " + err.message);
                    return Promise.reject(err);
                });
            }
            return undefined;
        });
    };
    Builder.prototype.buildTarget = function (target, targetName, stackTrace) {
        var _this = this;
        var targetMtimePromise = mtimeR(targetName);
        var prereqNames = target.prereqs || []; // TODO: should use the same logic as
        if (prereqNames.length == 0) {
            this.logger.log(targetName + " has no prerequisites");
        }
        else {
            this.logger.log(targetName + " has " + prereqNames.length + " prerequisites: " + prereqNames.join(', '));
        }
        var prereqSet = this.getTargetPrereqSet(target);
        var prereqStackTrace = stackTrace.concat(targetName);
        var latestPrereqMtime = undefined;
        var prereqAndMtimePromz = [];
        var _loop_1 = function (prereq) {
            prereqAndMtimePromz.push(this_1.build(prereq, prereqStackTrace).then(function () {
                return mtimeR(prereq).then(function (mtime) { return ({ name: prereq, mtime: mtime }); });
            }));
        };
        var this_1 = this;
        for (var prereq in prereqSet) {
            _loop_1(prereq);
        }
        return targetMtimePromise.then(function (targetMtime) {
            return Promise.all(prereqAndMtimePromz).then(function (prereqsAndMtimes) {
                var needRebuild;
                if (targetMtime == undefined) {
                    _this.logger.log("Mtime of " + targetName + " is undefined; need rebuild!");
                    needRebuild = true;
                }
                else {
                    needRebuild = false;
                    for (var m in prereqsAndMtimes) {
                        var prereqAndMtime = prereqsAndMtimes[m];
                        var prereqName = prereqAndMtime.name;
                        var prereqMtime = prereqAndMtime.mtime;
                        if (prereqMtime == undefined || targetMtime == undefined || prereqMtime > targetMtime) {
                            _this.logger.log("OUT-OF-DATE: " + prereqName + " is newer than " + targetName + "; need to rebuild (" + prereqMtime + " > " + targetMtime + ")");
                            needRebuild = true;
                        }
                        else {
                            _this.logger.log(prereqName + " not newer than " + targetName + " (" + prereqMtime + " !> " + targetMtime + ")");
                        }
                    }
                }
                if (needRebuild) {
                    _this.logger.log("Building " + targetName + "...");
                    if (target.invoke) {
                        return target.invoke({
                            builder: _this,
                            prereqNames: prereqNames,
                            targetName: targetName,
                        }).then(function () {
                            _this.logger.log("Build " + targetName + " complete!");
                            if (target.isDirectory) {
                                return _this.touch(targetName);
                            }
                            return;
                        }, function (err) {
                            console.error("Error trace: " + stackTrace.join(' > ') + " > " + targetName);
                            if (!target.keepOnFailure) {
                                console.error("Removing " + targetName);
                                return rmRf(targetName).then(function () { return Promise.reject(err); });
                            }
                            return Promise.resolve();
                        });
                    }
                    else {
                        _this.logger.log(targetName + " has no build rule; assuming up-to-date");
                        return Promise.resolve();
                    }
                }
                else {
                    _this.logger.log(targetName + " is already up-to-date");
                    return Promise.resolve();
                }
            });
        });
    };
    Builder.prototype.build = function (targetName, stackTrace) {
        var _this = this;
        if (this.buildPromises[targetName])
            return this.buildPromises[targetName];
        return this.buildPromises[targetName] = this.fetchTarget(targetName).then(function (targ) {
            if (targ == null) {
                return new Promise(function (resolve, reject) {
                    fs.stat(targetName, function (err, stats) {
                        if (err) {
                            reject(new Error(targetName + " does not exist and I don't know how to build it."));
                        }
                        else {
                            _this.logger.log(targetName + " exists but has no build rule; assuming up-to-date");
                            resolve();
                        }
                    });
                });
            }
            else {
                return _this.buildTarget(targ, targetName, stackTrace);
            }
        });
    };
    Builder.prototype.processArgvAndBuild = function (argv) {
        var buildList = [];
        var operation = 'build';
        var verbosity = 100;
        for (var i = 0; i < argv.length; ++i) {
            var arg = argv[i];
            if (arg == '--list-targets') {
                operation = 'list-targets';
            }
            else if (arg == '--describe-targets') {
                operation = 'describe-targets';
            }
            else if (arg == '-v') {
                verbosity = 200;
            }
            else {
                // Make tab-completing on Windows not screw us all up!
                buildList.push(arg.replace(/\\/, '/'));
            }
        }
        if (verbosity >= 200) {
            this.logger = console;
        }
        else {
            this.logger = {
                log: function () { },
                error: function () { },
            };
        }
        if (operation == 'list-targets') {
            return this.fetchAllTargets().then(function (targets) {
                for (var n in targets)
                    console.log(n);
            });
        }
        else if (operation == 'describe-targets') {
            return this.fetchAllTargets().then(function (targets) {
                // TODO: Print prettier and allowing for multi-line descriptions
                for (var n in targets) {
                    var target = targets[n];
                    var text = n;
                    if (target.description)
                        text += " ; " + target.description;
                    console.log(text);
                }
            });
        }
        else if (operation == 'build') {
            if (buildList.length == 0)
                buildList.push('default');
            var buildProms = [];
            for (var i in buildList) {
                buildProms.push(this.build(buildList[i], ["argv[" + i + "]"]));
            }
            return Promise.all(buildProms).then(function () { });
        }
        else {
            return Promise.reject(new Error("Bad operation: '" + operation + "'"));
        }
    };
    Builder.prototype.processCommandLineAndSetExitCode = function (argv) {
        var _this = this;
        this.processArgvAndBuild(argv).then(function () {
            _this.logger.log("Build completed");
        }, function (err) {
            console.error("Error!", err.message, err.stack);
            console.error("Build failed!");
            process.exitCode = 1;
        });
    };
    ;
    return Builder;
}());
exports.default = Builder;
