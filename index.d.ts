import { Action, ActionCreator, AnyAction, StoreEnhancer, Store } from 'redux';

type Maybe<T> = T | undefined;

export interface StoreCreator {
  <S, A extends Action>(
    reducer: LoopReducer<S, A>,
    preloadedState: S | undefined,
    enhancer: StoreEnhancer<S>
  ): Store<S>;
}

type WithDefaultActionHandling<T extends AnyAction> = T | Action<'@@REDUX_LOOP/ENFORCE_DEFAULT_HANDLING'>;

export type Loop<S, A extends Action = never> = [S, CmdType<A>];

export interface LoopReducer<S, ReducerActions extends Action = AnyAction, LoopActions extends Action = never> {
  (state: S | undefined, action: WithDefaultActionHandling<ReducerActions>, ...args: any[]): S | Loop<S, LoopActions>;
}

export interface LoopReducerWithDefinedState<S, ReducerActions extends Action = AnyAction, LoopActions extends Action = never> {
  (state: S, action: WithDefaultActionHandling<ReducerActions>, ...args: any[]): S | Loop<S, LoopActions>;
}

export interface LiftedLoopReducer<S, ReducerActions extends Action = AnyAction, LoopActions extends Action = never> {
  (state: S | undefined, action: WithDefaultActionHandling<ReducerActions>, ...args: any[]): Loop<S, LoopActions>;
}

export type CmdSimulation = {
  result: any,
  success: boolean
};
export interface MultiCmdSimulation {
  [index: number]: CmdSimulation | MultiCmdSimulation;
}

export interface NoneCmd {
  readonly type: 'NONE';
  simulate(): null;
}

export interface ListCmd<A extends Action = never> {
  readonly type: 'LIST';
  readonly cmds: CmdType<A>[];
  readonly sequence?: boolean;
  readonly batch?: boolean;
  simulate(simulations: MultiCmdSimulation): A[];
}

export interface ActionCmd<A extends Action> {
  readonly type: 'ACTION';
  readonly actionToDispatch: A;
  simulate(): A;
}

export interface MapCmd<A extends Action = never> {
  readonly type: 'MAP';
  readonly tagger: ActionCreator<A>;
  readonly nestedCmd: CmdType<A>;
  readonly args: any[];
  simulate(simulations?: CmdSimulation | MultiCmdSimulation): A[] | A | null
}

export interface RunCmd<SuccessAction extends Action = never, FailAction extends Action = never> {
  readonly type: 'RUN';
  readonly func: Function;
  readonly args?: any[];
  readonly failActionCreator?: ActionCreator<FailAction>;
  readonly successActionCreator?: ActionCreator<SuccessAction>;
  readonly forceSync?: boolean;
  simulate(simulation: CmdSimulation): SuccessAction | FailAction;
}

export type CmdType<A extends Action = never> =
  | ActionCmd<A>
  | ListCmd<A>
  | MapCmd<A>
  | NoneCmd
  | RunCmd<A>;

export interface LoopConfig {
  readonly DONT_LOG_ERRORS_ON_HANDLED_FAILURES: boolean;
}

export function install<S>(config?: LoopConfig): StoreEnhancer<S>;

export function loop<S, A extends Action = never>(
  state: S,
  cmd: CmdType<A>
): Loop<S, A>;

export namespace Cmd {
  export const dispatch: unique symbol;
  export const getState: unique symbol;
  export const none: NoneCmd;
  export type Dispatch = <A extends Action>(a: A) => Promise<A>;
  export type GetState = <S>() => S;

  export function action<A extends Action>(action: A): ActionCmd<A>;
  
  export function list(
    cmds: CmdType[],
    options?: {
      batch?: boolean;
      sequence?: boolean;
      testInvariants?: boolean;
    }
  ): ListCmd;

  export function list<A extends Action>(
    cmds: CmdType<A>[],
    options?: {
      batch?: boolean;
      sequence?: boolean;
      testInvariants?: boolean;
    }
  ): ListCmd<A>;

  export function map<A extends Action, B extends Action>(
    cmd: CmdType<B>,
    tagger: (subAction: B) => A,
    args?: any[]
  ): MapCmd<A>;

  // Allow the use of special dispatch | getState symbols
  type ArgOrSymbol<T> = {
    [K in keyof T]:
      T[K] extends GetState
        ? typeof getState
        : T[K] extends Dispatch
          ? typeof dispatch
          : T[K];
  }

  export type PromiseResult<T> = T extends Promise<infer U> ? U : T;

  type RunFunc = (...args: any[]) => Promise<any> | any;

  type RunOptions<
    Func extends RunFunc,
    SuccessAction extends Action = never,
    FailAction extends Action = never,
    FailReason = unknown
  > = {
    args?: ArgOrSymbol<Parameters<Func>>;
    forceSync?: boolean;
    testInvariants?: boolean;
    successActionCreator: (value: PromiseResult<ReturnType<Func>>) => SuccessAction;
    failActionCreator: (error: FailReason) => FailAction;
  }

  export function run<Func extends RunFunc>(
    f: Func,
    options?: Omit<RunOptions<Func>, 'successActionCreator' | 'failActionCreator'>,
  ): RunCmd;

  export function run<
    Func extends (...args: any[]) => Promise<any> | any,
    SuccessAction extends Action,
  >(
    f: Func,
    options: Omit<RunOptions<Func, SuccessAction>, 'failActionCreator'>,
  ): RunCmd<SuccessAction, never>;

  export function run<
    Func extends (...args: any[]) => Promise<any> | any,
    FailAction extends Action,
    FailReason = unknown
  >(
    f: Func,
    options: Omit<RunOptions<Func, never, FailAction, FailReason>, 'successActionCreator'>,
  ): RunCmd<never, FailAction>;

  export function run<
    Func extends (...args: any[]) => Promise<any> | any,
    SuccessAction extends Action = never,
    FailAction extends Action = never,
    FailReason = unknown
  >(
    f: Func,
    options: RunOptions<Func, SuccessAction, FailAction, FailReason>,
  ): RunCmd<SuccessAction, FailAction>;
}

export type ReducerMapObject<S, A extends Action = AnyAction> = {
  [K in keyof S]: LoopReducer<S[K], A>;
}

export function combineReducers<S, A extends Action = AnyAction>(
  reducers: ReducerMapObject<S, A>
): LiftedLoopReducer<S, A>;

export function mergeChildReducers<S, A extends Action = AnyAction>(
  parentResult: S | Loop<S, A>,
  action: AnyAction,
  childMap: ReducerMapObject<S, A>
): Loop<S, A>;

export function reduceReducers<S, A extends Action = AnyAction>(
  initialReducer: LoopReducer<S, A>,
  ...reducers: Array<LoopReducerWithDefinedState<S, A>>
): LiftedLoopReducer<S, A>;

export function liftState<S, A extends Action>(
  state: S | Loop<S, A>
): Loop<S, A>;

export function isLoop(test: any): boolean;

export function getModel<S>(loop: S | Loop<S, AnyAction>): S;

export function getCmd<A extends Action>(a: any): CmdType<A> | null;
export function getCmd(a: any): CmdType | null;
