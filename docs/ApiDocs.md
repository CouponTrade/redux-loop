# API Docs

* [`install()`](#install)
* [`loop(state, effect)`](#loopstate-effect)
* [`Effects`](#effects)
  * [`Effects.none()`](#effectsnone)
  * [`Effects.constant(action)`](#effectsconstantaction)
  * [`Effects.promise(promiseFactory, ...args)`](#effectspromisepromisefactory-args)
  * [`Effects.batch(effects)`](#effectsbatcheffects)

## `install()`

#### Notes
`install` applies the store enhancer to Redux's `createStore`. You'll need to
apply it either independently or with `compose` to use redux-loop's features in
your store. redux-loop internally takes over your top level state's shape and
and then decorates `store.getState` in order to provide your app with the state
you are expecting. You'll need to account for this if you are using other
enhancers like `applyMiddleware` or `DevTools.instrument` by applying `install`
last.

#### Examples
**Applied separately (no other enhancers):**

```javascript
import { createStore } from 'redux';
import { install } from 'redux-loop';
import reducer from './reducer';

const store = install()(createStore)(reducer);
```

**Applied with other enhancers:**
```javascript
import { createStore, compose, applyMiddleware } from 'redux';
import someMiddleware from 'some-middleware';
import installOther from 'other-enhancer';
import { install as installReduxLoop } from 'redux-loop';
import reducer from './reducer';

const finalCreateStore = compose(
  applyMiddleware(someMiddleware),
  installOther(),
  installReduxLoop()
);

const store = finalCreateStore(reducer);
```

## `loop(state, effect)`

* `state: any` &ndash; the new store state, like you would normally return from
  a reducer.
* `effect: Effect` &ndash; an effect to run once the current action has been
  dispatched, can be a result of any of the functions available under `Effects`.

#### Notes

`loop` enables you to run effects as the result of a particular action being
dispatched. It links synchronous state transitions with expected async state
transitions. When you return a `loop` result from your reducer, the store knows
how to separate effects from state so effects are not stored in the state tree
with data.

#### Examples

```javascript
import { loop, Effects } from 'redux-loop';

function reducer(state, action) {
  switch(action.type) {
    case 'FIRST':
      // This result is a loop. The new state will have its `first` property
      // set to true. As a result of receiving this result from the reducer,
      // the store will not only replace this part of the state with the new
      // state setting `first` to true, it will schedule the SECOND action to
      // run next.
      return loop(
        { ...state, first: true },
        Effects.constant({ type: 'SECOND' })
      );

    case 'SECOND':
      // This result is not a loop, just a plain synchronous state transition.
      // Returning loops from a reducer is optional by branch. The store knows
      // how to examine results and compose effects into a separate effect tree
      // from the state tree.
      return { ...state, second: true };
  }
}
```

## `Effects`

#### Notes

The `Effects` object provides access to all of the functions you'll need to
represent different kinds of effects to redux-loop's effects processor. Every
effect is a plain JavaScript object that simply describes to the store how to
process it. Effects are never executed in the reducer, leaving your reducer pure
and testable.

### `Effects.none()`

#### Notes

`none` is a no-op effect that you can use for convenience when building custom
effect creators from the ones provided. Since it does not resolve to an action
it doesn't cause any effects to actually occur.

#### Examples

```javascript
// The following two expressions are equivalent when processed by the store.

return loop(
  { state, someProp: action.payload },
  Effects.none()
);

// ...

return { state, someProp: action.payload }
```

### `Effects.constant(action)`

* `action: Action` &ndash; a plain object with a `type` property that the store
  can dispatch.

#### Notes

`constant` allows you to schedule a plain action object for dispatch after the
current dispatch is complete. It can be useful for initiating multiple sequences
that run in parallel but don't need to communicate or complete at the same time.

#### Examples

```javascript
// Once the store has finished updating this part of the state with the new
// result where `someProp` is set to `action.payload` it will schedule another
// dispatch for the action SOME_ACTION.
return loop(
  { state, someProp: action.payload },
  Effects.constant({ type: 'SOME_ACTION' })
);
```

### `Effects.promise(promiseFactory, ...args)`

* `promiseFactory: (...Array<any>) => Promise<Action>` &ndash a function which,
  when called with the values in `args`, will return a Promise that will
  _**always**_ resolve to an action, even if the underlying process fails.
  Remember to call `.catch`!
* `args: Array<any>` &ndash any arguments to call `promiseFactory` with.

#### Notes

`promise` allows you to declaratively schedule a function to be called with some
arguments that returns a Promise for an action, which will then be awaited and
the resulting action dispatched once available. This function allows you to
represent almost any kind of async process to the store without sacrificing
functional purity or having to encapsulate implicit state outside of your
reducer. Keep in mind, functions that are handed off to the store with `promise`
are never invoked in the reducer, only by the store during your application's
runtime. You can invoke a reducer that returns a `promise` effect as many times
as you want and always get the same result by deep-equality without triggering
any async function calls in the process.

#### Examples

```javascript
function fetchData(id) {
  return fetch(`endpoint/${id}`)
    .then((r) => r.json())
    .then((data) => ({ type: 'FETCH_SUCCESS', payload: data })
    .catch((error) => ({ type: 'FETCH_FAILURE', payload: error.message }));
}

function reducer(state, action) {
  switch(action.type) {
    case 'FETCH_START':
      return loop(
        { ...state, loading: true },
        Effects.promise(fetchData, action.payload.id)
      );

    case 'FETCH_SUCCESS':
      return { ...state, loading: false, data: action.payload };

    case 'FETCH_FAILURE':
      return { ...state, loading: false, errorMessage: action.payload };
  }
}
```

### `Effects.batch(effects)`

* `effects: Array<Effect>` &ndash; an array of effects returned by any of the
  other effects functions, or even nested calls to `Effects.batch`

#### Notes

`batch` allows you to group effects as a single effect to be awaited and
dispatched. All effects run in a batch will be executed in parallel, but they
will not proceed in parallel. For example, if a long-running request is batched
with an action scheduled with `Effects.constant`, no dispatching of either
effect will occur until the long-running request completes.

#### Examples

```javascript
// In this example, we can DRY up the setting of the `loading` property by
// batching `fetchData` with a `STOP_LOADING` action.

function fetchData(id) {
  return fetch(`endpoint/${id}`)
    .then((r) => r.json())
    .then((data) => ({ type: 'FETCH_SUCCESS', payload: data })
    .catch((error) => ({ type: 'FETCH_FAILURE', payload: error.message }));
}

function reducer(state, action) {
  switch(action.type) {
    case 'FETCH_START':
      return loop(
        { ...state, loading: true },
        Effects.batch([
          Effects.promise(fetchData, action.payload.id),
          Effects.constant({ type: 'STOP_LOADING' })
        ])
      );

    case 'FETCH_SUCCESS':
      return { ...state, data: action.payload };

    case 'FETCH_FAILURE':
      return { ...state, errorMessage: action.payload };

    case 'STOP_LOADING':
      return { ...state, loading: false };
  }
}
```
