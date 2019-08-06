// This file is maintained as part of NodeBuildUtil: https://github.com/TOGoS/NodeBuildUtil
// If you're making fixes and want to make sure they get merged upstream,
// PR to that project.
// Otherwise, feel free to remove this comment.

///<reference types="node" />

import * as fs from 'fs';
import { RESOLVED_VOID_PROMISE_CALLBACK } from './promises';

type FilePath = string;
type PlzIgnore = any;

export function stat( file:FilePath ):Promise<fs.Stats> {
	return new Promise( (resolve,reject) => {
		fs.stat(file, (err,stats) => {
			if( err ) reject(err);
			else resolve(stats);
		})
	});
}

type WalkCallback = (path:FilePath) => any;

/** Recursively walk a directory, applying fileCallback to every non-directory within it.
 *  The returned promise resolves after all callbacks' returned promises have resolved */
export function walkDir(dirPath:FilePath, fileCallback:WalkCallback):Promise<unknown> {
	return readDir(dirPath).then( filenames => {
		let promises = [];
		for( let i in filenames ) {
			const filename = filenames[i];
			const path = dirPath+"/"+filename;
			promises.push(stat(path).then( x => {
				if( x.isDirectory() ) {
					return walkDir(path, fileCallback);
				} else {
					return fileCallback(path);
				}
			}));
		}
		return Promise.all(promises);
	});
}

export function readFile( file:FilePath, options:{encoding?:string, flag?:string}={} ):Promise<Buffer|string> {
	return new Promise( (resolve,reject) => {
		fs.readFile(file, options, (err:Error,content:Buffer) => {
			if( err ) reject(err);
			else resolve(content);
		})
	});
}

export function writeFile( file:FilePath, data:string|Uint8Array ):Promise<FilePath> {
	return new Promise( (resolve,reject) => {
		fs.writeFile( file, data, (err) => {
			if( err ) reject(err);
			resolve(file);
		});
	});
}

export function readFileToString( file:FilePath, options:{encoding?:string|undefined, flag?:string}={} ):Promise<string> {
	const trueOptions = {
		encoding: options.encoding || "utf8",
		flag: options.flag
	};
	return readFile(file,trueOptions).then( (content) => {
		// Shouldn't happen, since we're not allowing encoding to be specified, but just in case we screw up:
		if( typeof content != 'string' ) return Promise.reject(new Error("File not read as a string!"));
		// Supposedly Buffer acts as a Uint8Array, so we can just return it.
		return Promise.resolve(content);
	});
}

export function readFileToUint8Array( file:FilePath, options:{flag?:string}={} ):Promise<Uint8Array> {
	if( (<any>options).encoding ) {
		return Promise.reject(new Error("Why you passing 'encoding' to readFileToUint8Array"));
	}
	return readFile(file,options).then( (content) => {
		// Shouldn't happen, since we're not allowing encoding to be specified, but just in case we screw up:
		if( typeof content == 'string' ) return Promise.reject(new Error("File read as a string!"));
		// Supposedly Buffer acts as a Uint8Array, so we can just return it.
		return Promise.resolve(content);
	});
}

export function readDir( dir:FilePath ):Promise<FilePath[]> {
	return new Promise( (resolve,reject) => {
		fs.readdir( dir, (err,files) => {
			if( err ) return reject(err);
			return resolve(files);
		});
	});
}

export function rmDir( dir:FilePath ):Promise<void> {
	return new Promise<void>( (resolve,reject) => {
		fs.rmdir(dir, (err) => {
			if( err ) reject(err);
			else resolve();
		})
	});
}

export function rename( oldPath:FilePath, newPath:FilePath ):Promise<FilePath> {
	return new Promise( (resolve,reject) => {
		fs.rename(oldPath, newPath, (err) => {
			if( err ) reject(err);
			else resolve(newPath);
		})
	});
};

export function link( oldPath:FilePath, newPath:FilePath ):Promise<FilePath> {
	return new Promise( (resolve,reject) => {
		fs.link(oldPath, newPath, (err) => {
			if( err ) reject(err);
			else resolve(newPath);
		})
	});
};

export function unlink( file:FilePath ):Promise<void> {
	return new Promise<void>( (resolve,reject) => {
		fs.unlink(file, (err) => {
			if( err ) reject(err);
			else resolve();
		})
	});
}

export function rmRf( fileOrDir:FilePath|string[] ):Promise<void> {
	if( typeof fileOrDir == 'object' ) {
		return Promise.all(fileOrDir.map(rmRf)).then( () => {} );
	}
	return stat(fileOrDir).then( (stats) => {
		if( stats.isDirectory() ) {
			return readDir(fileOrDir).then( (files) => {
				let promz:Promise<void>[] = [];
				for( let i in files ) {
					promz.push(rmRf( fileOrDir+"/"+files[i] ));
				}
				return Promise.all(promz);
			}).then( () => rmDir(fileOrDir) );
		} else {
			return unlink(fileOrDir);
		}
	}, (err) => {
		if( err.code === 'ENOENT' ) return;
		else return Promise.reject(err);
	});	
}

export function cp( src:FilePath, dest:FilePath ):Promise<FilePath> {
	return new Promise( (resolve,reject) => {
		let rd = fs.createReadStream(src);
		rd.on('error', reject);
		let wr = fs.createWriteStream(dest);
		wr.on('error', reject);
		wr.on('close', () => resolve(dest) );
		rd.pipe(wr);
	});
}

export function mkdir( dir:FilePath ):Promise<FilePath> {
	return new Promise( (resolve,reject) => {
		fs.mkdir( dir, (err) => {
			if( err && err.code !== 'EEXIST' ) {
				reject(err);
			} else {
				resolve(dir);
			}
		});
	});
}

export function mkdirR( dir:FilePath ):Promise<PlzIgnore> {
	if( dir == '' ) return Promise.resolve();
	let prefix = '';
	if( dir[0] == '/' ) {
		dir = dir.substr(1);
		prefix = '/';
	}
	let comps = dir.split('/');
	let prom:Promise<PlzIgnore> = Promise.resolve();
	for( let i=1; i<=comps.length; ++i ) {
		prom = prom.then( () => mkdir(prefix+comps.slice(0,i).join('/')) );
	}
	return prom;
}

export function mkParentDirs( file:FilePath ):Promise<PlzIgnore> {
	let comps = file.split('/');
	return mkdirR( comps.slice(0,comps.length-1).join('/') );
}

export function cpR( src:FilePath, dest:FilePath ):Promise<PlzIgnore> {
	return stat(src).then( (srcStat:fs.Stats) => {
		if( srcStat.isDirectory() ) {
			let mkdirPromise:Promise<any> = mkdir(dest);
			return readDir(src).then( (files) => mkdirPromise.then(() => {
				let subPromises:Promise<PlzIgnore>[] = [];
				for( let f in files ) {
					subPromises.push(cpR( src+"/"+files[f], dest+"/"+files[f] ));
				};
				return Promise.all(subPromises).then(RESOLVED_VOID_PROMISE_CALLBACK);
			}));
		} else {
			return cp( src, dest ).then(RESOLVED_VOID_PROMISE_CALLBACK);
		}
	});
}

export function cpRReplacing( src:FilePath, dest:FilePath ):Promise<PlzIgnore> {
	return rmRf( dest ).then( () => cpR(src,dest) );
}

export function mtimeR( fileOrDir:FilePath ):Promise<Date|undefined> {
	return stat(fileOrDir).then( (stats) => {
		if( stats.isFile() ) {
			return stats.mtime;
		} else if( stats.isDirectory() ) {
			return readDir(fileOrDir).then( (files) => {
				let mtimePromz:Promise<Date|undefined>[] = [];
				for( let f in files ) {
					let fullPath = fileOrDir+"/"+files[f];
					mtimePromz.push(mtimeR(fullPath));
				}
				return Promise.all(mtimePromz).then( (mtimes) => {
					let maxMtime = stats.mtime;
					for( let m in mtimes ) {
						const mtime = mtimes[m];
						if( mtime != undefined && mtime > maxMtime ) {
							maxMtime = mtime;
						}
					}
					return maxMtime;
				});
			});
		} else {
			return Promise.reject(new Error(fileOrDir+" is neither a regular file or a directory!"));
		}
	}, (err) => {
		if( err.code == 'ENOENT' ) return undefined;
		return Promise.reject(new Error("Failed to stat "+fileOrDir+": "+JSON.stringify(err)));
	});
}
