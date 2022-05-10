import PropTypes from 'prop-types';
import React from 'react';
import type { RefObject, ReactNode } from 'react';
import ReactDOM from 'react-dom';

import config from './config';
import { timeoutsShape } from './utils/PropTypes';
import TransitionGroupContext from './TransitionGroupContext';

export const UNMOUNTED = 'unmounted';
export const EXITED = 'exited';
export const ENTERING = 'entering';
export const ENTERED = 'entered';
export const EXITING = 'exiting';

export type TransitionState =
  | 'unmounted'
  | 'exited'
  | 'entering'
  | 'entered'
  | 'exiting';

export type Props = {
  nodeRef?: RefObject<HTMLElement>;
  // The childProps argument is not documented
  children: (state: TransitionState, childProps: any) => ReactNode;
  in: boolean;
  mountOnEnter: boolean;
  unmountOnExit: boolean;
  appear: boolean;
  enter: boolean;
  exit: boolean;
  timeout: number | { appear?: number; enter?: number; exit?: number };
  addEndListener: (node: HTMLElement | undefined, done: boolean) => void;
  onEnter: (maybeNode: HTMLElement | boolean, isAppearing?: boolean) => void;
  onEntering: (maybeNode: HTMLElement | boolean, isAppearing?: boolean) => void;
  onEntered: (maybeNode: HTMLElement | boolean, isAppearing?: boolean) => void;
  onExit: (node?: HTMLElement) => void;
  onExiting: (node?: HTMLElement) => void;
  onExited: (node?: HTMLElement) => void;
};

type State = {
  status: TransitionState;
};

/**
 * The Transition component lets you describe a transition from one component
 * state to another _over time_ with a simple declarative API. Most commonly
 * it's used to animate the mounting and unmounting of a component, but can also
 * be used to describe in-place transition states as well.
 *
 * ---
 *
 * **Note**: `Transition` is a platform-agnostic base component. If you're using
 * transitions in CSS, you'll probably want to use
 * [`CSSTransition`](https://reactcommunity.org/react-transition-group/css-transition)
 * instead. It inherits all the features of `Transition`, but contains
 * additional features necessary to play nice with CSS transitions (hence the
 * name of the component).
 *
 * ---
 *
 * By default the `Transition` component does not alter the behavior of the
 * component it renders, it only tracks "enter" and "exit" states for the
 * components. It's up to you to give meaning and effect to those states. For
 * example we can add styles to a component when it enters or exits:
 *
 * ```jsx
 * import { Transition } from 'react-transition-group';
 *
 * const duration = 300;
 *
 * const defaultStyle = {
 *   transition: `opacity ${duration}ms ease-in-out`,
 *   opacity: 0,
 * }
 *
 * const transitionStyles = {
 *   entering: { opacity: 1 },
 *   entered:  { opacity: 1 },
 *   exiting:  { opacity: 0 },
 *   exited:  { opacity: 0 },
 * };
 *
 * const Fade = ({ in: inProp }) => (
 *   <Transition in={inProp} timeout={duration}>
 *     {state => (
 *       <div style={{
 *         ...defaultStyle,
 *         ...transitionStyles[state]
 *       }}>
 *         I'm a fade Transition!
 *       </div>
 *     )}
 *   </Transition>
 * );
 * ```
 *
 * There are 4 main states a Transition can be in:
 *  - `'entering'`
 *  - `'entered'`
 *  - `'exiting'`
 *  - `'exited'`
 *
 * Transition state is toggled via the `in` prop. When `true` the component
 * begins the "Enter" stage. During this stage, the component will shift from
 * its current transition state, to `'entering'` for the duration of the
 * transition and then to the `'entered'` stage once it's complete. Let's take
 * the following example (we'll use the
 * [useState](https://reactjs.org/docs/hooks-reference.html#usestate) hook):
 *
 * ```jsx
 * function App() {
 *   const [inProp, setInProp] = useState(false);
 *   return (
 *     <div>
 *       <Transition in={inProp} timeout={500}>
 *         {state => (
 *           // ...
 *         )}
 *       </Transition>
 *       <button onClick={() => setInProp(true)}>
 *         Click to Enter
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 *
 * When the button is clicked the component will shift to the `'entering'` state
 * and stay there for 500ms (the value of `timeout`) before it finally switches
 * to `'entered'`.
 *
 * When `in` is `false` the same thing happens except the state moves from
 * `'exiting'` to `'exited'`.
 */
class Transition extends React.Component<Props, State> {
  appearStatus: TransitionState | null;
  nextCallback: any;

  static defaultProps = {
    in: false,
    mountOnEnter: false,
    unmountOnExit: false,
    appear: false,
    enter: true,
    exit: true,

    onEnter: noop,
    onEntering: noop,
    onEntered: noop,

    onExit: noop,
    onExiting: noop,
    onExited: noop,
  };
  static UNMOUNTED = UNMOUNTED;
  static EXITED = EXITED;
  static ENTERING = ENTERING;
  static ENTERED = ENTERED;
  static EXITING = EXITING;

  static propTypes = {
    /**
     * A React reference to DOM element that need to transition:
     * https://stackoverflow.com/a/51127130/4671932
     *
     *   - When `nodeRef` prop is used, `node` is not passed to callback functions
     *      (e.g. `onEnter`) because user already has direct access to the node.
     *   - When changing `key` prop of `Transition` in a `TransitionGroup` a new
     *     `nodeRef` need to be provided to `Transition` with changed `key` prop
     *     (see
     *     [test/CSSTransition-test.js](https://github.com/reactjs/react-transition-group/blob/13435f897b3ab71f6e19d724f145596f5910581c/test/CSSTransition-test.js#L362-L437)).
     */
    nodeRef: PropTypes.shape({
      // @ts-expect-error We'll remove the PropTypes definition
      current:
        typeof Element === 'undefined'
          ? PropTypes.any
          : // @ts-expect-error We'll remove the PropTypes definition
            (propValue, key, componentName, location, propFullName, secret) => {
              const value = propValue[key];

              return PropTypes.instanceOf(
                value && 'ownerDocument' in value
                  ? value.ownerDocument.defaultView.Element
                  : Element
                // @ts-expect-error We'll remove the PropTypes definition
              )(propValue, key, componentName, location, propFullName, secret);
            },
    }),

    /**
     * A `function` child can be used instead of a React element. This function is
     * called with the current transition status (`'entering'`, `'entered'`,
     * `'exiting'`, `'exited'`), which can be used to apply context
     * specific props to a component.
     *
     * ```jsx
     * <Transition in={this.state.in} timeout={150}>
     *   {state => (
     *     <MyComponent className={`fade fade-${state}`} />
     *   )}
     * </Transition>
     * ```
     */
    children: PropTypes.oneOfType([
      PropTypes.func.isRequired,
      PropTypes.element.isRequired,
    ]).isRequired,

    /**
     * Show the component; triggers the enter or exit states
     */
    in: PropTypes.bool,

    /**
     * By default the child component is mounted immediately along with
     * the parent `Transition` component. If you want to "lazy mount" the component on the
     * first `in={true}` you can set `mountOnEnter`. After the first enter transition the component will stay
     * mounted, even on "exited", unless you also specify `unmountOnExit`.
     */
    mountOnEnter: PropTypes.bool,

    /**
     * By default the child component stays mounted after it reaches the `'exited'` state.
     * Set `unmountOnExit` if you'd prefer to unmount the component after it finishes exiting.
     */
    unmountOnExit: PropTypes.bool,

    /**
     * By default the child component does not perform the enter transition when
     * it first mounts, regardless of the value of `in`. If you want this
     * behavior, set both `appear` and `in` to `true`.
     *
     * > **Note**: there are no special appear states like `appearing`/`appeared`, this prop
     * > only adds an additional enter transition. However, in the
     * > `<CSSTransition>` component that first enter transition does result in
     * > additional `.appear-*` classes, that way you can choose to style it
     * > differently.
     */
    appear: PropTypes.bool,

    /**
     * Enable or disable enter transitions.
     */
    enter: PropTypes.bool,

    /**
     * Enable or disable exit transitions.
     */
    exit: PropTypes.bool,

    /**
     * The duration of the transition, in milliseconds.
     * Required unless `addEndListener` is provided.
     *
     * You may specify a single timeout for all transitions:
     *
     * ```jsx
     * timeout={500}
     * ```
     *
     * or individually:
     *
     * ```jsx
     * timeout={{
     *  appear: 500,
     *  enter: 300,
     *  exit: 500,
     * }}
     * ```
     *
     * - `appear` defaults to the value of `enter`
     * - `enter` defaults to `0`
     * - `exit` defaults to `0`
     *
     * @type {number | { enter?: number, exit?: number, appear?: number }}
     */
    timeout: (props: any, ...args: any[]) => {
      let pt = timeoutsShape;
      // @ts-expect-error We'll remove the PropTypes definition
      if (!props.addEndListener) pt = pt.isRequired;
      // @ts-expect-error We'll remove the PropTypes definition
      return pt(props, ...args);
    },

    /**
     * Add a custom transition end trigger. Called with the transitioning
     * DOM node and a `done` callback. Allows for more fine grained transition end
     * logic. Timeouts are still used as a fallback if provided.
     *
     * **Note**: when `nodeRef` prop is passed, `node` is not passed.
     *
     * ```jsx
     * addEndListener={(node, done) => {
     *   // use the css transitionend event to mark the finish of a transition
     *   node.addEventListener('transitionend', done, false);
     * }}
     * ```
     */
    addEndListener: PropTypes.func,

    /**
     * Callback fired before the "entering" status is applied. An extra parameter
     * `isAppearing` is supplied to indicate if the enter stage is occurring on the initial mount
     *
     * **Note**: when `nodeRef` prop is passed, `node` is not passed.
     *
     * @type Function(node: HtmlElement, isAppearing: bool) -> void
     */
    onEnter: PropTypes.func,

    /**
     * Callback fired after the "entering" status is applied. An extra parameter
     * `isAppearing` is supplied to indicate if the enter stage is occurring on the initial mount
     *
     * **Note**: when `nodeRef` prop is passed, `node` is not passed.
     *
     * @type Function(node: HtmlElement, isAppearing: bool)
     */
    onEntering: PropTypes.func,

    /**
     * Callback fired after the "entered" status is applied. An extra parameter
     * `isAppearing` is supplied to indicate if the enter stage is occurring on the initial mount
     *
     * **Note**: when `nodeRef` prop is passed, `node` is not passed.
     *
     * @type Function(node: HtmlElement, isAppearing: bool) -> void
     */
    onEntered: PropTypes.func,

    /**
     * Callback fired before the "exiting" status is applied.
     *
     * **Note**: when `nodeRef` prop is passed, `node` is not passed.
     *
     * @type Function(node: HtmlElement) -> void
     */
    onExit: PropTypes.func,

    /**
     * Callback fired after the "exiting" status is applied.
     *
     * **Note**: when `nodeRef` prop is passed, `node` is not passed.
     *
     * @type Function(node: HtmlElement) -> void
     */
    onExiting: PropTypes.func,

    /**
     * Callback fired after the "exited" status is applied.
     *
     * **Note**: when `nodeRef` prop is passed, `node` is not passed
     *
     * @type Function(node: HtmlElement) -> void
     */
    onExited: PropTypes.func,
  };

  static contextType = TransitionGroupContext;

  constructor(props: Props, context: any) {
    super(props, context);

    let parentGroup = context;
    // In the context of a TransitionGroup all enters are really appears
    let appear =
      parentGroup && !parentGroup.isMounting ? props.enter : props.appear;

    let initialStatus: TransitionState;

    this.appearStatus = null;

    if (props.in) {
      if (appear) {
        initialStatus = EXITED;
        this.appearStatus = ENTERING;
      } else {
        initialStatus = ENTERED;
      }
    } else {
      if (props.unmountOnExit || props.mountOnEnter) {
        initialStatus = UNMOUNTED;
      } else {
        initialStatus = EXITED;
      }
    }

    this.state = { status: initialStatus };

    this.nextCallback = null;
  }

  static getDerivedStateFromProps(
    { in: nextIn }: { in: boolean },
    prevState: State
  ) {
    if (nextIn && prevState.status === UNMOUNTED) {
      return { status: EXITED };
    }
    return null;
  }

  // getSnapshotBeforeUpdate(prevProps) {
  //   let nextStatus = null

  //   if (prevProps !== this.props) {
  //     const { status } = this.state

  //     if (this.props.in) {
  //       if (status !== ENTERING && status !== ENTERED) {
  //         nextStatus = ENTERING
  //       }
  //     } else {
  //       if (status === ENTERING || status === ENTERED) {
  //         nextStatus = EXITING
  //       }
  //     }
  //   }

  //   return { nextStatus }
  // }

  componentDidMount() {
    this.updateStatus(true, this.appearStatus);
  }

  componentDidUpdate(prevProps: Props) {
    let nextStatus: TransitionState | null = null;
    if (prevProps !== this.props) {
      const { status } = this.state;

      if (this.props.in) {
        if (status !== ENTERING && status !== ENTERED) {
          nextStatus = ENTERING;
        }
      } else {
        if (status === ENTERING || status === ENTERED) {
          nextStatus = EXITING;
        }
      }
    }
    this.updateStatus(false, nextStatus);
  }

  componentWillUnmount() {
    this.cancelNextCallback();
  }

  getTimeouts() {
    const { timeout } = this.props;
    let exit, enter, appear;

    if (timeout != null && typeof timeout !== 'number') {
      exit = timeout.exit;
      enter = timeout.enter;
      // TODO: remove fallback for next major
      appear = timeout.appear !== undefined ? timeout.appear : enter;
    } else {
      exit = enter = appear = timeout;
    }
    return { exit, enter, appear };
  }

  updateStatus(mounting = false, nextStatus: TransitionState | null) {
    if (nextStatus !== null) {
      // nextStatus will always be ENTERING or EXITING.
      this.cancelNextCallback();

      if (nextStatus === ENTERING) {
        this.performEnter(mounting);
      } else {
        this.performExit();
      }
    } else if (this.props.unmountOnExit && this.state.status === EXITED) {
      this.setState({ status: UNMOUNTED });
    }
  }

  performEnter(mounting: boolean) {
    const { enter } = this.props;
    const appearing = this.context ? this.context.isMounting : mounting;
    const [maybeNode, maybeAppearing] = this.props.nodeRef
      ? [appearing]
      : [ReactDOM.findDOMNode(this), appearing];

    const timeouts = this.getTimeouts();
    const enterTimeout = appearing ? timeouts.appear : timeouts.enter;
    // no enter animation skip right to ENTERED
    // if we are mounting and running this it means appear _must_ be set
    if ((!mounting && !enter) || config.disabled) {
      this.safeSetState({ status: ENTERED }, () => {
        this.props.onEntered(maybeNode);
      });
      return;
    }

    this.props.onEnter(maybeNode, maybeAppearing);

    this.safeSetState({ status: ENTERING }, () => {
      this.props.onEntering(maybeNode, maybeAppearing);

      this.onTransitionEnd(enterTimeout, () => {
        this.safeSetState({ status: ENTERED }, () => {
          this.props.onEntered(maybeNode, maybeAppearing);
        });
      });
    });
  }

  performExit() {
    const { exit } = this.props;
    const timeouts = this.getTimeouts();
    // @ts-expect-error FIXME: Type 'Element | Text | null | undefined' is not assignable to type 'HTMLElement | undefined' Type 'null' is not assignable to type 'HTMLElement | undefined'.ts(2322)
    const maybeNode: HTMLElement | undefined = this.props.nodeRef
      ? undefined
      : ReactDOM.findDOMNode(this);

    // no exit animation skip right to EXITED
    if (!exit || config.disabled) {
      this.safeSetState({ status: EXITED }, () => {
        this.props.onExited(maybeNode);
      });
      return;
    }

    this.props.onExit(maybeNode);

    this.safeSetState({ status: EXITING }, () => {
      this.props.onExiting(maybeNode);

      this.onTransitionEnd(timeouts.exit, () => {
        this.safeSetState({ status: EXITED }, () => {
          this.props.onExited(maybeNode);
        });
      });
    });
  }

  cancelNextCallback() {
    if (this.nextCallback !== null) {
      this.nextCallback.cancel();
      this.nextCallback = null;
    }
  }

  safeSetState(nextState: State, callback: () => void) {
    // This shouldn't be necessary, but there are weird race conditions with
    // setState callbacks and unmounting in testing, so always make sure that
    // we can cancel any pending setState callbacks after we unmount.
    callback = this.setNextCallback(callback);
    this.setState(nextState, callback);
  }

  setNextCallback(callback: () => void) {
    let active = true;

    this.nextCallback = () => {
      if (active) {
        active = false;
        this.nextCallback = null;

        callback();
      }
    };

    this.nextCallback.cancel = () => {
      active = false;
    };

    return this.nextCallback;
  }

  onTransitionEnd(timeout: number | undefined, handler: () => void) {
    this.setNextCallback(handler);
    const node = this.props.nodeRef
      ? this.props.nodeRef.current
      : ReactDOM.findDOMNode(this);

    const doesNotHaveTimeoutOrListener =
      timeout == null && !this.props.addEndListener;
    if (!node || doesNotHaveTimeoutOrListener) {
      setTimeout(this.nextCallback, 0);
      return;
    }

    if (this.props.addEndListener) {
      const [maybeNode, maybeNextCallback] = this.props.nodeRef
        ? [this.nextCallback]
        : [node, this.nextCallback];
      this.props.addEndListener(maybeNode, maybeNextCallback);
    }

    if (timeout != null) {
      setTimeout(this.nextCallback, timeout);
    }
  }

  render() {
    const status = this.state.status;

    if (status === UNMOUNTED) {
      return null;
    }

    const {
      children,
      // filter props for `Transition`
      in: _in,
      mountOnEnter,
      unmountOnExit,
      appear,
      enter,
      exit,
      timeout,
      addEndListener,
      onEnter,
      onEntering,
      onEntered,
      onExit,
      onExiting,
      onExited,
      nodeRef,
      ...childProps
    } = this.props;

    return (
      // allows for nested Transitions
      <TransitionGroupContext.Provider value={null}>
        {typeof children === 'function'
          ? children(status, childProps)
          : // @ts-expect-error FIXME: Type 'ReactChildren' is missing the following properties from type 'ReactElement<any, string | JSXElementConstructor<any>>': type, props, keyts(2769)
            React.cloneElement(React.Children.only(children), childProps)}
      </TransitionGroupContext.Provider>
    );
  }
}

// Name the function so it is clearer in the documentation
function noop() {
  /* noop */
}

export default Transition;