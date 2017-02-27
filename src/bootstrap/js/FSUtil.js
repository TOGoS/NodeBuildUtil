///<reference types="node" />
///<reference path="Promise.d.ts"/>
"use strict";
var fs = require("fs");
var promises_1 = require("./promises");
function stat(file) {
    return new Promise(function (resolve, reject) {
        fs.stat(file, function (err, stats) {
            if (err)
                reject(err);
            else
                resolve(stats);
        });
    });
}
exports.stat = stat;
function readFile(file, options) {
    if (options === void 0) { options = {}; }
    return new Promise(function (resolve, reject) {
        fs.readFile(file, options, function (err, content) {
            if (err)
                reject(err);
            else
                resolve(content);
        });
    });
}
exports.readFile = readFile;
function writeFile(file, data) {
    return new Promise(function (resolve, reject) {
        fs.writeFile(file, data, function (err) {
            if (err)
                reject(err);
            resolve(file);
        });
    });
}
exports.writeFile = writeFile;
function readFileToUint8Array(file, options) {
    if (options === void 0) { options = {}; }
    return readFile(file, options).then(function (content) {
        if (typeof content == 'string')
            return Promise.reject(new Error("File read as a string!"));
        // Supposedly Buffer acts as a Uint8Array, so we can just return it.
        return Promise.resolve(content);
    });
}
exports.readFileToUint8Array = readFileToUint8Array;
function readDir(dir) {
    return new Promise(function (resolve, reject) {
        fs.readdir(dir, function (err, files) {
            if (err)
                return reject(err);
            return resolve(files);
        });
    });
}
exports.readDir = readDir;
function rmDir(dir) {
    return new Promise(function (resolve, reject) {
        fs.rmdir(dir, function (err) {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
}
exports.rmDir = rmDir;
function rename(oldPath, newPath) {
    return new Promise(function (resolve, reject) {
        fs.rename(oldPath, newPath, function (err) {
            if (err)
                reject(err);
            else
                resolve(newPath);
        });
    });
}
exports.rename = rename;
;
function link(oldPath, newPath) {
    return new Promise(function (resolve, reject) {
        fs.link(oldPath, newPath, function (err) {
            if (err)
                reject(err);
            else
                resolve(newPath);
        });
    });
}
exports.link = link;
;
function unlink(file) {
    return new Promise(function (resolve, reject) {
        fs.unlink(file, function (err) {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
}
exports.unlink = unlink;
function rmRf(fileOrDir) {
    if (typeof fileOrDir == 'object') {
        return promises_1.voidify(Promise.all(fileOrDir.map(rmRf)));
    }
    return stat(fileOrDir).then(function (stats) {
        if (stats.isDirectory()) {
            return readDir(fileOrDir).then(function (files) {
                var promz = [];
                for (var i in files) {
                    promz.push(rmRf(fileOrDir + "/" + files[i]));
                }
                return Promise.all(promz);
            }).then(function () { return rmDir(fileOrDir); });
        }
        else {
            return unlink(fileOrDir);
        }
    }, function (err) {
        if (err.code === 'ENOENT')
            return;
        else
            return Promise.reject(err);
    });
}
exports.rmRf = rmRf;
function cp(src, dest) {
    return new Promise(function (resolve, reject) {
        var rd = fs.createReadStream(src);
        rd.on('error', reject);
        var wr = fs.createWriteStream(dest);
        wr.on('error', reject);
        wr.on('close', function () { return resolve(dest); });
        rd.pipe(wr);
    });
}
exports.cp = cp;
function mkdir(dir) {
    return new Promise(function (resolve, reject) {
        fs.mkdir(dir, function (err) {
            if (err && err.code !== 'EEXIST') {
                reject(err);
            }
            else {
                resolve(dir);
            }
        });
    });
}
exports.mkdir = mkdir;
function mkdirR(dir) {
    var comps = dir.split('/');
    var prom = promises_1.RESOLVED_VOID_PROMISE;
    var _loop_1 = function (i) {
        prom = prom.then(function () {
            mkdir(comps.slice(0, i).join('/'));
        });
    };
    for (var i = 1; i <= comps.length; ++i) {
        _loop_1(i);
    }
    return prom;
}
exports.mkdirR = mkdirR;
function mkParentDirs(file) {
    var comps = file.split('/');
    return mkdirR(comps.slice(0, comps.length - 1).join('/'));
}
exports.mkParentDirs = mkParentDirs;
function cpR(src, dest) {
    return stat(src).then(function (srcStat) {
        if (srcStat.isDirectory()) {
            var cpPromise_1 = mkdir(dest);
            return readDir(src).then(function (files) {
                for (var f in files) {
                    cpPromise_1 = cpPromise_1.then(function () {
                        cpR(src + "/" + files[f], dest + "/" + files[f]);
                    });
                }
                ;
                return cpPromise_1;
            });
        }
        else {
            return cp(src, dest);
        }
    });
}
exports.cpR = cpR;
function cpRReplacing(src, dest) {
    return rmRf(dest).then(function () { return cpR(src, dest); });
}
exports.cpRReplacing = cpRReplacing;
function mtimeR(fileOrDir) {
    return stat(fileOrDir).then(function (stats) {
        if (stats.isFile()) {
            return stats.mtime;
        }
        else if (stats.isDirectory()) {
            return readDir(fileOrDir).then(function (files) {
                var mtimePromz = [];
                for (var f in files) {
                    var fullPath = fileOrDir + "/" + files[f];
                    mtimePromz.push(mtimeR(fullPath));
                }
                return Promise.all(mtimePromz).then(function (mtimes) {
                    var maxMtime = stats.mtime;
                    for (var m in mtimes) {
                        if (mtimes[m] != undefined && mtimes[m] > maxMtime) {
                            maxMtime = mtimes[m];
                        }
                    }
                    return maxMtime;
                });
            });
        }
        else {
            return Promise.reject(new Error(fileOrDir + " is neither a regular file or a directory!"));
        }
    }, function (err) {
        if (err.code == 'ENOENT')
            return undefined;
        return Promise.reject(new Error("Failed to stat " + fileOrDir + ": " + JSON.stringify(err)));
    });
}
exports.mtimeR = mtimeR;
