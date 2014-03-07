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

### Example

A common usecase would be to manage a single socket connection. You could do
this by writing something like this:

```javascript
var bb = new Browbeat();

// If we win an election, establish a socket connection.
bb.on('wonElection', function won() {
  var socket = new WebSocket('myhost');
  socket.onopen = function connectionOpen() {
    socket.onmessage = function socketMessage(msg) {
      // Forward socket message to slaves
      bb.messageSlaves(msg.data);

      // Use data in this window
      var data = JSON.parse(msg.data);
      alert(data);
    }
  }
});

// Handle messages from master
bb.on('slave', function slaveMessage(msg) {
  var data = JSON.parse(msg.data);
  alert(data);
});
```

## API

Most of the Browbeat API is internal and you should mostly interact with it by
listening to events. There are a few methods you need to be aware of though.

### `resign()`

Resign will only work on the current master. It'll trigger the event `resigned`
on the master and stop it's own heartbeat. Which in turn will lead to a new
election being initiated.

### `on(_event_, _handler_)`

Register an event listener with Browbeat. The `name` is the name of the event
you want to listen for. `handler` is the function you want to be triggered
when the event is emitted.

The handler will be passed any additional data provided by the event.

### `off(_event_, _handler_)`

Removes the given handler from the given event. `hanlder` must be a reference
to the exact same function as was given to `on()`.

### `broadcast(_message_)`

Sends a message to all open windows on the same domain. Will trigger the
`broadcast` event with the message as the only argument to the handler.

### `messageMaster(_message_)`

Sends a message to the master. Will trigger the `master` message on the master
only, the handler recieves the messages.

### `messageSlave(_message_)`

Sends a message to all slaves. Will trigger the event `slave` on all open
windows that are not the master. The handler recieves the message as it's only
argument.

### `sendMessage(_message_, _data_)`

Let's you trigger an arbitrary event on all windows other then the current one.
You can use this to dispatch custom events.

Note that _data_ can only be serialized data, ie. you need to stringify JSON
first or similar.

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

