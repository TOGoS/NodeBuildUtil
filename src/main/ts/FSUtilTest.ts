import * as fsu from './FSUtil';
import { RESOLVED_VOID_PROMISE_CALLBACK, RESOLVED_VOID_PROMISE } from './promises';

function testMkdirs():Promise<void> {
	let dirsToMake:string[] = [];
	let promz:Promise<any>[] = [];
	for( let i=0; i<100; ++i ) {
		let depth = 1 + Math.floor(Math.random() * 4);
		let parts = ['temp','mkdir-test'];
		for( let j=0; j<depth; ++j ) {
			// Have leading parts be common
			let comp:string;
			if( j == depth-1 ) {
				comp = ""+Math.floor(Math.random()*1000);
			} else {
				comp = ""+Math.floor(Math.random()*10);
			}
			parts.push(comp);
		}
		const path = parts.join("/");
		promz.push(fsu.mkdirR(path).then( () => {
			// Make sure it actually exists!
			return fsu.readDir(path);
		}));
	}
	return Promise.all(promz).then(RESOLVED_VOID_PROMISE_CALLBACK);
}

function testReadFileToUint8Array():Promise<void> {
	return fsu.readFileToUint8Array('build.js').then( (bytes:Uint8Array) => {
		if( !(bytes instanceof Uint8Array) ) return Promise.reject(new Error("Value returned by readFileToUint8Array not a Uint8Array!"));
		if( bytes.length <= 0 ) return Promise.reject(new Error("Uint8Array returned by readFileToUint8Array has non-positive length: "+bytes.length));
		return RESOLVED_VOID_PROMISE;
	});
}
function testReadFileToString():Promise<void> {
	return fsu.readFileToString('build.js').then( (str:string) => {
		if( typeof str != 'string' ) return Promise.reject(new Error("Value returned by readFileToString not a string!"));
		if( str.length <= 0 ) return Promise.reject(new Error("String returned by readFileToString has non-positive length: "+str.length));
		return RESOLVED_VOID_PROMISE;
	});
}

const tests:{[k:string]: ()=>Promise<void>} = {
	testMkdirs,
	testReadFileToUint8Array,
	testReadFileToString,
};

let prom = Promise.resolve();
for( let testName in tests ) {
	const testProm = tests[testName]();
	prom = prom.then( ()=>testProm ).then( () => {
		console.log("FSUtilTest."+testName+": Okay");
	}, (err:Error) => {
		console.error("FSUtilTest."+testName+": "+err.stack);
		process.exitCode = 1;
	});
}
