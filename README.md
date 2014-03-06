# Browbeat

Elect a master window using the
[Bully algorithm](http://en.wikipedia.org/wiki/Bully_algorithm).

__This is a very early release. Not quite recommended for production.__

## Why?

Imagine you have a site where it's common for users to open multiple tabs.
Maybe you have some realtime functionality or something that requires a lot of
AJAX requests or similar. Instead of maintaing one socket or having
one message queue (for AJAX) per tab you can have _one_ window being
responsible. One sockect connection instead of `n` socket connections.

## How It Works

_Browbeat_ uses `localStorage` as a message bus for communication between open
windows on the same domain. Using the Bully algorithm one window is elected to
be the master.

The elected window can then be used to for example keep one open websocket
instead of one per tab.

### Election Process

1. A page is loaded. The new page will wait a second to see if a heartbeat
from an existing master appears.
2. If such heartbeat exist the page will happily register itself as a "worker".
3. If no such heartbeat exists the page will start an election process.
4. If any other tabs are opened before the election ends they will submit their
"vote". A vote is just a number.
5. Once the election process is over the tab with the highest submitted number
becomes the new master.

### Local Storage Support

If _Browbeat_ is loaded in a browser that does not support `localStorage` it will
always behave as if it was the master. All the appropriate events etc
will be broadcast "locally" on the window once such a condition is detected.

This means you don't have to separate your logic if you want to support all
cases.

## Using Browbeat

To use _Browbeat_ you simple instantiate a new object using the constructor.

```javascript
var bb = new Browbeat();
```

You may optionally pass an options object to the constructor. Available options
are:

* **heartbeatTTL**, how long to wait for a heartbeat (in ms) before initiating
a new election. The actual heartbeat interval will be half of this.
* **electionTime**, how long to run the election (in ms) before picking a new
master window.
* **gcLimit**, upper limit on amount of messages that may be garbage collected
everytime the collector runs.
* **debug**, when set to `true` _Browbeat_ will output a tiny amount of debug
information to help you determine the current state.

**This section is expanding, hang on for more documentation.**

## Events

_Browbeat_ implements it's own custom event emitter. You can subsrive to events
by calling the `on()` method.

```javascript
var bb = new Browbeat();
bb.on('wonElection', function () {
  // This window won the election. Establish socket connections etc.
});
```

### Available Events

* **master**, emitted when someone sent a message to the master. Will only be
triggered on the master window.
* **slave**, emitted when someone sent a message to all slaves. Will not be
triggered on the master.
* **broadcast**, emitted when someone sends a message to everybody.
* **sentMessage**, emitted everytime someone sends a message to anybody.
* **wonElection**, emitted on the window that one the election.
* **resigned**, triggered on the master if it resigns (when the `resign()`
method is called).
* **lostElection**, emitted on all the windows that didn't win the election.
* **voting**, emitted when the window registers a vote during an election.
* **electionInitiated**, emitted when a new election begins.
* **electionConcluded**, emitted when an election has concluded.

**Custom events** can be sent by calling the `sendMessage()` method. The
method takes two arguments; _message_ and _data_. Message is the event that
will be triggered on any other open window.

## Browser Support

Should support all major browsers and IE8+.

# License

_Browbeat_ is distributed under the MIT license.

