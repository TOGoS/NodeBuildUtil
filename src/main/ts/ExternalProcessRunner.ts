import Logger, { NULL_LOGGER } from './Logger';
import * as child_process from 'child_process';
import * as fs from 'fs';

export interface ProcessOptions {
	silent?: boolean,
	onNz?: 'error'|'return',
	stdio?: any,
	cwd?: string,
}

type ExternalCommand = string[];
type ExternalProcessResult = number;

export default class ExternalProcessRunner {
	protected logger : Logger = NULL_LOGGER;
	
	protected findWorkingProgram(alternatives:ExternalCommand[], testPostfix:ExternalCommand, start=0, name="a program"):Promise<string[]> {
		if( start >= alternatives.length ) return Promise.reject(new Error("Couldn't figure out how to run "+name+"!"));
		let testCommand = [...alternatives[start], ...testPostfix];
		return this.doCmd(testCommand, {silent: true}).then( () => {
			return alternatives[start];
		}, (err) => {
			this.logger.log(this.argsToShellCommand(testCommand)+" didn't work; will try something else...")
			return this.findWorkingProgram(alternatives, testPostfix, start+1, name);
		})
	}
	
	public argsToShellCommand( args:string|string[] ) {
		if( typeof args === 'string' ) return args;
		let escaped:string[] = [];
		for( let i in args ) {
			let arg = args[i];
			if( arg.match(/^[a-zA-Z0-9\/\.\+_\-]+$/) ) escaped.push(arg);
			else escaped.push( '"'+arg.replace(/["\$\\]/g,'\\$&')+'"');
		}
		return escaped.join(' ');
	}
	
	protected processCmd(cmd:string|string[]):Promise<ExternalCommand> {
		if( typeof cmd === 'string' ) {
			return this.figureShellCommand().then( (shell) => shell.concat([cmd]) );
		}
		return Promise.resolve(cmd);
	}
	
	public doCmd( args:string|string[], opts:ProcessOptions={} ):Promise<ExternalProcessResult> {
		if( !opts ) opts = {};
		let silent = opts.silent == undefined ? true : opts.silent;
		let stdio = opts.stdio || opts.silent ? undefined : 'inherit';
		let onNz = opts.onNz || 'error';
		return this.processCmd(args).then( (args) => {
			let argStr = this.argsToShellCommand(args);
			this.logger.log("+ "+argStr);
			return new Promise( (resolve,reject) => {
				let cproc;
				if( typeof args === 'string' ) {
					cproc = child_process.spawn( args, [], {
						shell: true,
						cwd: opts.cwd,
						stdio
					} );
				} else {
					cproc = child_process.spawn( args[0], args.slice(1), {
						cwd: opts.cwd,
						stdio
					} );
				}
				cproc.on('error', reject);
				cproc.on('close', (exitCode:number) => {
					if( exitCode == 0 || onNz == 'return' ) resolve(exitCode);
					else reject(new Error("Process exited with code "+exitCode+": "+argStr));
				});
			});
		});
	}
	
	protected shellCommandPromise:Promise<ExternalCommand>|undefined = undefined;
	public figureShellCommand():Promise<ExternalCommand> {
		if( this.shellCommandPromise ) return this.shellCommandPromise;
		
		let alternatives = [
			['cmd.exe', '/c'], // Windoze!
			['sh', '-c'], // Unix!
		];
		
		return this.shellCommandPromise = this.findWorkingProgram(alternatives, ['exit 0'], 0, 'shell');
	}

	public npmCommandPromise:Promise<ExternalCommand>|undefined = undefined;
	public figureNpmCommand() {
		if( this.npmCommandPromise ) return this.npmCommandPromise;
		
		// Most non-Windows systems will look at the path for us,
		// so 'npm' should be sufficient.
		if( process.platform != 'win32' ) return this.npmCommandPromise = Promise.resolve(['npm']); 
		
		// Not so on windows!
		// We'll look for npm-cli.js by iterating over everything in %Path%
		
		let alternatives = [
			['npm'],
		];
		
		let envPath = process.env.Path;
		let envPaths = (envPath != '' && envPath != undefined) ? envPath.split(';') : [];
		let leftToCheck = envPaths.length;
		let findNpmCliJsPromise = Promise.resolve();
		leftToCheck == 0 ? Promise.resolve() : new Promise( (resolve,reject) => {
			for( let p in envPaths ) {
				let npmCliJsPath = envPaths[p]+'/node_modules/npm/bin/npm-cli.js';
				fs.stat(npmCliJsPath, (err,stats) => {
					if( !err ) alternatives.push( ['node', npmCliJsPath] );
					if( --leftToCheck == 0 ) resolve();
				});
			}
		});
		
		return this.npmCommandPromise = findNpmCliJsPromise.then( () => this.findWorkingProgram(alternatives, ['-v'], 0, 'npm') );
	}

	public figureNodeCommand():Promise<ExternalCommand> {
		return Promise.resolve(['node']);
	}

	public node( args:ExternalCommand, opts:ProcessOptions={} ):Promise<ExternalProcessResult> {
		return this.figureNodeCommand().then( (nodeCmd) => this.doCmd(nodeCmd.concat(args), opts) );
	}

	public npm( args:ExternalCommand, opts:ProcessOptions={} ):Promise<ExternalProcessResult> {
		return this.figureNpmCommand().then( (npmCmd) => this.doCmd(npmCmd.concat(args), opts) );
	}

	public tsc( args:ExternalCommand, opts:ProcessOptions={} ):Promise<ExternalProcessResult> {
		return this.doCmd(["node","node_modules/typescript/bin/tsc"].concat(args), opts);
	}
}
