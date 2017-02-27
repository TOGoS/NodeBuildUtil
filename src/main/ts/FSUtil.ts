///<reference types="node" />
///<reference path="Promise.d.ts"/>

import * as fs from 'fs';
import { RESOLVED_VOID_PROMISE, voidify } from './promises';

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

export function readFile( file:FilePath, options:string|{encoding?:string, flag?:string}={} ):Promise<Buffer|string> {
	return new Promise( (resolve,reject) => {
		fs.readFile(file, options, (err,content) => {
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

export function readFileToUint8Array( file:FilePath, options:string|{encoding?:string, flag?:string}={} ):Promise<Uint8Array> {
	return readFile(file,options).then( (content) => {
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
		return voidify(Promise.all(fileOrDir.map(rmRf)));
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

export function mkdirR( dir:FilePath ):Promise<any> {
	let comps = dir.split('/');
	let prom:Promise<void> = RESOLVED_VOID_PROMISE;
	for( let i=1; i<=comps.length; ++i ) {
		prom = prom.then( () => {
			mkdir(comps.slice(0,i).join('/'));
	 	} );
	}
	return prom;
}

export function mkParentDirs( file:FilePath ):Promise<PlzIgnore> {
	let comps = file.split('/');
	return mkdirR( comps.slice(0,comps.length-1).join('/') );
}

export function cpR( src:FilePath, dest:FilePath ):Promise<PlzIgnore> {
	return stat(src).then( (srcStat) => {
		if( srcStat.isDirectory() ) {
			let cpPromise:Promise<any> = mkdir(dest);
			return readDir(src).then( (files) => {
				for( let f in files ) {
					cpPromise = cpPromise.then( () => {
						cpR( src+"/"+files[f], dest+"/"+files[f] );
					});
				};
				return cpPromise;
			});
		} else {
			return cp( src, dest );
		}
	});
}

export function cpRReplacing( src:FilePath, dest:FilePath ):Promise<PlzIgnore> {
	return rmRf( dest ).then( () => cpR(src,dest) );
}

export function mtimeR( fileOrDir:FilePath ):Promise<Date> {
	return stat(fileOrDir).then( (stats) => {
		if( stats.isFile() ) {
			return stats.mtime;
		} else if( stats.isDirectory() ) {
			return readDir(fileOrDir).then( (files) => {
				let mtimePromz:Promise<Date>[] = [];
				for( let f in files ) {
					let fullPath = fileOrDir+"/"+files[f];
					mtimePromz.push(mtimeR(fullPath));
				}
				return Promise.all(mtimePromz).then( (mtimes) => {
					let maxMtime = stats.mtime;
					for( let m in mtimes ) {
						if( mtimes[m] != undefined && mtimes[m] > maxMtime ) {
							maxMtime = mtimes[m];
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
