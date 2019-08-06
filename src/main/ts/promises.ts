declare function Symbol(x:string):symbol;

enum State {
    NORMAL,
    RESOLVED,
    REJECTED
} 

const STATESYM = Symbol("resolved");
const VALUESYM = Symbol("value");
const ERRORSYM = Symbol("value");

export const RESOLVED_VOID_PROMISE:Promise<void> = resolvedPromise(undefined);
export const RESOLVED_VOID_PROMISE_CALLBACK:()=>Promise<void> = () => RESOLVED_VOID_PROMISE;

export function voidify<T>( p:Promise<T> ):Promise<void> {
    return p.then( RESOLVED_VOID_PROMISE_CALLBACK );
}

export function resolvedPromise<T>( value:T ) : Promise<T> {
    const p = Promise.resolve(value);
    (<any>p)[VALUESYM] = value;
    (<any>p)[STATESYM] = State.RESOLVED;
    return p;
}

/**
 * Add a callback to a promise so that once it resolves
 * it can be queried immediately.
 */
export function resolveWrap<X, T extends PromiseLike<X>>( thenable:T ):T {
    const thenableProps:any = thenable;
    if( thenableProps[STATESYM] == undefined ) {
        thenableProps[STATESYM] = State.NORMAL;
        thenable.then( (v:X) => {
            thenableProps[STATESYM] = State.RESOLVED;
            thenableProps[VALUESYM] = v;
        }, (error:any) => {
            thenableProps[STATESYM] = State.REJECTED;
            thenableProps[ERRORSYM] = error;
        });
    }
    return thenable;
}

export function rejectedPromise<T>( error:Error ) : Promise<T> {
    const p = Promise.reject(value);
    (<any>p)[ERRORSYM] = error;
    (<any>p)[STATESYM] = State.REJECTED;
    return p;
}

export function isResolved<T>( p:PromiseLike<T> ):boolean {
    return (<any>p)[STATESYM] === State.RESOLVED;
}

export function isRejected<T>( p:PromiseLike<T> ):boolean {
    return (<any>p)[STATESYM] === State.REJECTED;
}

export function value<T>( p:PromiseLike<T> ):T {
    return <T>((<any>p)[VALUESYM]);
}

export function error<T>( p:PromiseLike<T> ):any {
    return (<any>p)[ERRORSYM];
}

function isThenable<T>( v:any ):v is PromiseLike<T> {
    return v != undefined && v.then; 
}

function thenable<T>( v:T|PromiseLike<T> ):PromiseLike<T> {
    return isThenable(v) ? v : resolvedPromise(v);
}

export function shortcutThen<T,U>( p:PromiseLike<T>, onResolve: (v:T)=>U|PromiseLike<U> ) : PromiseLike<U> {
    if( isResolved(p) ) {
        const u = onResolve(value(p));
        return isThenable(u) ? <PromiseLike<U>>u : resolvedPromise(u);
    }
    return p.then(onResolve);
}

/**
 * If p is null, return an immediately resolved promise.
 * Otherwise return p.
 */
export function vopToPromise<T>( p:PromiseLike<T>|void, v:T ):PromiseLike<T> {
    return p != null ? <PromiseLike<T>>p : resolvedPromise(v);
}

export function finalmente<T>( p:Promise<T>, finalStuff:()=>void ):Promise<T> {
	return p.then(
		(v) => { finalStuff(); return v; },
		(err) => { finalStuff(); return Promise.reject(err); }
	);
}
