/**
 * Console-compatible logging interface.
 */
interface Logger {
   error(message?: any, ...optionalParams: any[]): void;
   log(message?: any, ...optionalParams: any[]): void;
}

export const VERBOSITY_SILENT   = 0;
export const VERBOSITY_ERRORS   = 1;
export const VERBOSITY_WARNINGS = 2;
export const VERBOSITY_INFO     = 3;
export const VERBOSITY_DEBUG    = 4;

export class LevelFilteringLogger implements Logger {
	constructor( protected backingLogger:Logger, protected verbosity:number ) { }
	
   error(message?: any, ...etc: any[]): void {
		if( this.verbosity < VERBOSITY_ERRORS ) return;
		this.backingLogger.error( message, ...etc );
	}
	
   log(message?: any, ...etc: any[]): void {
		if( this.verbosity < VERBOSITY_INFO ) return;
		this.backingLogger.log( message, ...etc );
	}
}

export const NULL_LOGGER:Logger = {
	error(message?: any, ...optionalParams: any[]): void { },
	log(message?: any, ...optionalParams: any[]): void { },
}

export default Logger;
