// This file is maintained as part of NodeBuildUtil: https://github.com/TOGoS/NodeBuildUtil
// If you're making fixes and want to make sure they get merged upstream,
// PR to that project.
// Otherwise, feel free to remove this comment.

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as fsutil from './FSUtil';
import Logger, {NULL_LOGGER} from './Logger';
import ExternalProcessRunner, { ProcessOptions } from './ExternalProcessRunner';

const mtimeR = fsutil.mtimeR;
const rmRf = fsutil.rmRf;


type FilePath = string;

/**
 * Escape program arguments to represent as a command
 * that could be run at the shell.
 * For displaying to humans.
 * Don't actually run at the shell because escaping is probably imperfect.
 */
function argsToShellCommand( args:string[] ) {
	if( typeof args === 'string' ) return args;
	let escaped = [];
	for( let i in args ) {
		let arg = args[i];
		if( arg.match(/^[a-zA-Z0-9\/\.\+_\-]+$/) ) escaped.push(arg);
		else escaped.push( '"'+arg.replace(/["\$\\]/g,'\\$&')+'"');
	}
	return escaped.join(' ');
}

function toSet( arr:string[], into:{[k:string]: string} ) {
	if( into == undefined ) into = {};
	for( let x in arr ) into[arr[x]] = arr[x];
	return into;
}

// Object-Oriented Yeahhhh!!!!

interface BuildContext {
	builder: Builder;
	prereqNames: string[];
	targetName: string;
}

interface BuildTarget {
	description?: string;
	prereqs?: string[];
	getPrereqs?: () => string[];
	invoke(ctx:BuildContext):Promise<void>;
	keepOnFailure?: boolean;
	isDirectory?: boolean;
}

interface PrereqNameWithMtime {
	name : string;
	mtime : Date;
}

class Builder {
	/**
	 * List of things to always consider prereqs,
	 * such as the build script itself.
	 */
	public globalPrereqs:string[] = [];

	protected logger:Logger = NULL_LOGGER;
	protected buildPromises:{[name:string]: Promise<void>} = {};
	protected epr = new ExternalProcessRunner();

	public constructor(public targets:{[name:string]: BuildTarget}={}) {
	}

	public touch( fileOrDir:FilePath ) {
		this.logger.log("Touching "+fileOrDir);
		let curTime = Date.now()/1000;
		return new Promise( (resolve,reject) => {
			fs.utimes(fileOrDir, curTime, curTime, (err) => {
				if( err ) return reject(err);
				else resolve();
			})
		});
	};

	public doCmd( args:string[], opts:ProcessOptions={} ) {
		return this.epr.doCmd(args, opts);
	}
	public npm( args:string[], opts:ProcessOptions={} ) {
		return this.epr.npm(args, opts);
	}
	public node( args:string[], opts:ProcessOptions={} ) {
		return this.epr.node(args, opts);
	}
	public tsc( args:string[], opts:ProcessOptions={} ) {
		return this.epr.tsc(args, opts);
	}

	public fetchGeneratedTargets():Promise<{[name:string]:BuildTarget}> { return Promise.resolve({}) };

	public allTargetsPromise:Promise<{[name:string]:BuildTarget}>|undefined = undefined;
	public fetchAllTargets() {
		if( this.allTargetsPromise ) return this.allTargetsPromise;
		
		let allTargets:{[name:string]:BuildTarget} = {};
		for( let n in this.targets ) allTargets[n] = this.targets[n];
		return this.allTargetsPromise = this.fetchGeneratedTargets().then( (generatedTargets) => {
			for( let n in generatedTargets ) allTargets[n] = generatedTargets[n];
			return allTargets;
		});
	}

	public fetchTarget( targetName:string ):Promise<BuildTarget> {
		return this.fetchAllTargets().then( (targets) => targets[targetName] );
	}

	public getTargetPrereqSet( target:BuildTarget ) {
		let set = {}
		if( target.prereqs ) toSet(target.prereqs, set);
		if( target.getPrereqs ) toSet(target.getPrereqs(), set);
		toSet(this.globalPrereqs, set);
		return set;
	}

	public buildTarget( target:BuildTarget, targetName:string, stackTrace:string[] ):Promise<void> {
		let targetMtimePromise = mtimeR(targetName);
		let prereqNames = target.prereqs || []; // TODO: should use the same logic as
		if( prereqNames.length == 0 ) {
			this.logger.log(targetName+" has no prerequisites");
		} else {
			this.logger.log(targetName+" has "+prereqNames.length+" prerequisites: "+prereqNames.join(', '));
		}
		let prereqSet = this.getTargetPrereqSet(target);
		let prereqStackTrace = stackTrace.concat( targetName )
		let latestPrereqMtime = undefined;
		let prereqAndMtimePromz:Promise<PrereqNameWithMtime>[] = [];
		for( let prereq in prereqSet ) {
			prereqAndMtimePromz.push(this.build( prereq, prereqStackTrace ).then( () => {
				return mtimeR(prereq).then( (mtime:Date) => ({name:prereq, mtime}) );
			}));
		}
		
		return targetMtimePromise.then<void>( (targetMtime) => {
			return Promise.all(prereqAndMtimePromz).then( (prereqsAndMtimes:PrereqNameWithMtime[]):Promise<void> => {
				let needRebuild;
				if( targetMtime == undefined ) {
					this.logger.log("Mtime of "+targetName+" is undefined; need rebuild!");
					needRebuild = true;
				} else {
					needRebuild = false;
					for( let m in prereqsAndMtimes ) {
						let prereqAndMtime = prereqsAndMtimes[m];
						let prereqName = prereqAndMtime.name;
						let prereqMtime = prereqAndMtime.mtime;
						if( prereqMtime == undefined || targetMtime == undefined || prereqMtime > targetMtime ) {
							this.logger.log("OUT-OF-DATE: "+prereqName+" is newer than "+targetName+"; need to rebuild ("+prereqMtime+" > "+targetMtime+")");
							needRebuild = true;
						} else {
							this.logger.log(prereqName+" not newer than "+targetName+" ("+prereqMtime+" !> "+targetMtime+")");
						}
					}
				}

				if( needRebuild ) {
					this.logger.log("Building "+targetName+"...");
					if( target.invoke ) {
						return target.invoke({
							builder: this,
							prereqNames,
							targetName,
						}).then( () => {
							this.logger.log("Build "+targetName+" complete!");
							if( target.isDirectory ) {
								return this.touch(targetName);
							}
							return;
						}, (err:Error) => {
							console.error("Error trace: "+stackTrace.join(' > ')+" > "+targetName);
							if( !target.keepOnFailure ) {
								console.error("Removing "+targetName);
								return rmRf(targetName).then( () => Promise.reject(err) );
							}
							return;
						});
					} else {
						this.logger.log(targetName+" has no build rule; assuming up-to-date");
						return Promise.resolve();
					}
				} else {
					this.logger.log(targetName+" is already up-to-date");
					return Promise.resolve();
				}
			});
		});
	}

	public build( targetName:string, stackTrace:string[] ) {
		if( this.buildPromises[targetName] ) return this.buildPromises[targetName];
		
		return this.buildPromises[targetName] = this.fetchTarget(targetName).then( (targ) => {
			if( targ == null ) {
				return new Promise<void>( (resolve,reject) => {
					fs.stat(targetName, (err,stats) => {
						if( err ) {
							reject(new Error(targetName+" does not exist and I don't know how to build it."));
						} else {
							this.logger.log(targetName+" exists but has no build rule; assuming up-to-date");
							resolve();
						}
					});
				});
			} else {
				return this.buildTarget(targ, targetName, stackTrace);
			}
		});
	}

	public processArgvAndBuild(argv:string[]):Promise<void> {
		let buildList = [];
		let operation = 'build';
		let verbosity = 100;
		for( let i=0; i<argv.length; ++i ) {
			let arg = argv[i];
			if( arg == '--list-targets' ) {
				operation = 'list-targets';
			} else if( arg == '--describe-targets' ) {
				operation = 'describe-targets';
			} else if( arg == '-v' ) {
				verbosity = 200;
			} else {
				// Make tab-completing on Windows not screw us all up!
				buildList.push(arg.replace(/\\/,'/'));
			}
		}
		
		if( verbosity >= 200 ) {
			this.logger = console;
		} else {
			this.logger = {
				log: () => {},
				error: () => {},
			}
		}
		
		if( operation == 'list-targets' ) {
			return this.fetchAllTargets().then( (targets):void => {
				for( let n in targets ) console.log(n);
			});
		} else if( operation == 'describe-targets' ) {
			return this.fetchAllTargets().then( (targets):void => {
				// TODO: Print prettier and allowing for multi-line descriptions
				for( let n in targets ) {
					let target = targets[n];
					let text = n;
					if( target.description ) text += " ; " + target.description;
					console.log(text);
				}
			});
		} else if( operation == 'build' ) {
			if( buildList.length == 0 ) buildList.push('default');
			let buildProms = [];
			for( let i in buildList ) {
				buildProms.push(this.build(buildList[i], ["argv["+i+"]"]));
			}
			return Promise.all(buildProms).then( () => {} );
		} else {
			return Promise.reject(new Error("Bad operation: '"+operation+"'"));
		}
	}

	protected processCommandLineAndSetExitCode(argv:string[]) {
		this.processArgvAndBuild(argv).then( () => {
			this.logger.log("Build completed");
		}, (err:Error) => {
			console.error("Error!", err.message, err.stack);
			console.error("Build failed!");
			process.exitCode = 1;
		});
	};
}

export default Builder;
