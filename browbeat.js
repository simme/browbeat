//
// # Browbeat
//

(function () {
  // "Constants" for keys used in `localStorage`.
  var HEARTBEAT_KEY      = '_browbeat_heartbeat';
  var ELECTION_KEY       = '_browbeat_election';
  var ELECTION_START_KEY = '_browbeat_election_start';
  var CURRENT_KEY        = '_browbeat_currentMaster';
  var MSG_PREFIX         = '_browbeat_msg';
  var KEY_PREFIX         = '_browbeat_';

  //
  // ## Constructor
  //
  // Creates a new browbeat instance. Creating more then one Browbeat instance
  // per window is not recommended since storage events are not triggered on
  // the tab that initiated the change in `localStorage`. Hence the message
  // bus is broken.
  //
  // * **options**, an object of options. Available options are the properties
  //   assigned to `this` below.
  //
  var Browbeat = function Browbeat(options) {
    if (!this instanceof Browbeat) { return new Browbeat(options); }

    options = options || {};

    // How long to wait for a heartbeat before initiating a new election.
    // The actual heartbeat will be half of this value.
    this.heartbeatTTL = 2000;
    // For how long will the election be running?
    this.electionTime = 2000;
    // Set to `true` to recieve debug output.
    this.debug        = false;
    // Maximum number of messages to garbage collect on each run.
    this.gcLimit      = 100;

    for (var i in options) {
      if (typeof this[i] !== 'undefined') this[i] = options[i];
    }

    this.id              = Math.random() * 1000;
    this.store           = window.localStorage || false;
    this.isMaster        = false;
    this.sanityTimer     = null;
    this.heartbeatTimer  = null;
    this.gcTimer         = null;
    this.listeners       = {};
    this.heartbeatOffset = Math.random() * 10 + 500;

    this.init();
  };

  //
  // ## Log
  //
  // Debug function for console.logging.
  //
  Browbeat.prototype.log = function () {
    var args = Array.prototype.slice.call(arguments, 0);
    args.unshift('[Browbeat]');
    if (this.debug) console.log.apply(console, args);
  };

  //
  // ## Init
  //
  // Initializes the current Browbeat instance. Setups up event listeners and
  // checks the current state and acts accordingly.
  //
  Browbeat.prototype.init = function browbeatInit() {
    this.log('ID:', this.id);
    // No store means no support, make it the master
    if (!this.store) {
      return this.becomeMaster();
    }

    // Hook up storage event listener
    var self = this;
    function handler(event) { self.storageEvent(event); }
    if (window.addEventListener) {
      window.addEventListener('storage', handler, false);
    }
    else {
      window.attachEventListener('storage', handler);
    }

    // Check for ongoing election.
    var now = (new Date()).getTime();
    var lastHearbeat = this.store.getItem(HEARTBEAT_KEY) || 0;
    var election = this.store.getItem(ELECTION_KEY);
    var started = this.store.getItem(ELECTION_START_KEY);
    if (election && (now - started) < this.electionTime) {
      this.log('Ongoing election, casting vote');
      return this.castVote();
    }
    // Check for heartbeat, if fresh, become slave.
    else if (now - lastHearbeat < this.heartbeatTTL) {
      this.log('Found fresh heartbeat');
      return this.becomeSlave();
    }
    // Start election.
    else {
      return this.startElection();
    }
  };

  //
  // ## Handle Storage Event
  //
  // The storage event is used as a message bus between all open tabs. Thus
  // this method acts as kind of a message dispatcher.
  //
  Browbeat.prototype.storageEvent = function browbeatEventHandler(event) {
    var key = event.key;
    if (key.indexOf(KEY_PREFIX) !== 0) {
      return;
    }

    // Handle election events.
    if (key === ELECTION_KEY) {
      // No previous value means a new election was initiated, cast our vote.
      if (event.oldValue === null) {
        clearTimeout(this.heartbeatTimer);
        clearTimeout(this.sanityTimer);
        return this.castVote();
      }
    }

    if (key === CURRENT_KEY) {
      if (event.newValue === this.id.toString()) {
        return this.becomeMaster();
      }
      else {
        return this.becomeSlave();
      }
    }

    // Handle heartbeat events. Check for dead masters.
    if (!this.isMaster && key === HEARTBEAT_KEY) {
      var self = this;
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = setTimeout(function () {
        self.startElection();
      }, this.heartbeatTTL + this.heartbeatOffset);
      return;
    }

    if (key.indexOf(MSG_PREFIX) === 0) {
      var data = JSON.parse(event.newValue);
      switch (data.message) {
        case 'master':
          if (this.isMaster) { this.emit('master', data.data); }
          break;
        case 'slave':
          if (!this.isMaster) { this.emit('slave', data.data); }
          break;
        case 'broadcast':
          this.emit('broadcast', data.data);
          break;
        default:
          this.emit(data.message, data.data);
          break;
      }
      return;
    }
  };

  // -------------------------------------------------------------------------

  //
  // ## Become Master
  //
  // Becomes the master window. Initiate heartbeat and emit event.
  //
  Browbeat.prototype.becomeMaster = function browbeatElected() {
    this.log('Became master');
    var self = this;
    this.isMaster = true;
    this.emit('browbeatWonElection');

    if (this.store) {
      this.heartbeatTimer = setInterval(function heartbeat() {
        self.store.setItem(HEARTBEAT_KEY, (new Date()).getTime());
      }, this.heartbeatTTL / 2);

      // Garbage collect messages older then 2 seconds
      this.gcTimer = setInterval(function garbageCollect() {
        var now = (new Date()).getTime();
        var len = self.store.length;
        for (var i = len; i >= 0; i--) {
          if (i > self.gcLimit) break;
          var key = self.store.key(i);
          if (key && key.indexOf(MSG_PREFIX) === 0) {
            var parts = key.split('~');
            if (now - parseInt(parts[1], 10) > 2000) {
              self.store.removeItem(key);
              console.log('collected', key);
            }
          }
        }
      }, Math.random() * 20000);
    }
  };

  //
  // ## Resign
  //
  // Resigns presidency and let the other windows initiate a new election.
  // Assigns a new ID to avoid the same outcome after a vote.
  //
  Browbeat.prototype.resign = function browbeatResign() {
    this.id       = Math.random() * 1000;
    this.isMaster = false;
    this.emit('browbeatResigned');
    clearInterval(this.heartbeatTimer);
    this.becomeSlave();
  };

  //
  // ## Become Slave
  //
  // Did not win election. Monitor heartbeat and react to dead master.
  //
  Browbeat.prototype.becomeSlave = function browbeatBecomeSlave() {
    this.log('Became slave');
    this.isMaster = false;
    this.emit('browbeatLostElection');
    var self = this;
    clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = setTimeout(function () {
      self.startElection();
    }, this.heartbeatTTL + this.heartbeatOffset);
  };

  //
  // ## Cast Vote
  //
  // Register as a candidate in the election.
  //
  Browbeat.prototype.castVote = function browbeatVote() {
    clearTimeout(this.sanityTimer);
    this.log('Casting vote');
    var votes = this.store.getItem(ELECTION_KEY);
    votes = votes ? votes.split(',') : [];
    votes.push(this.id);
    this.store.setItem(ELECTION_KEY, votes);

    // Sometimes the initiating window will disappear before the election is
    // completed. To avoid a stalemate add a sanity check here.
    var self = this;
    this.sanity = setTimeout(function () {
      if (!self.store.getItem(CURRENT_KEY)) {
        self.startElection();
      }
    }, this.electionTime + this.heartbeatOffset);
  };

  //
  // ## Start Election
  //
  // Initiates a new election by writing to the localStorage. Since storage
  // events are not emitted to the window that initiated the event this method
  // also casts a vote.
  //
  Browbeat.prototype.startElection = function browbeatStartElection() {
    this.log('Initiating election');

    var self = this;
    this.store.removeItem(CURRENT_KEY);
    this.store.removeItem(HEARTBEAT_KEY);
    this.castVote();
    this.store.setItem(ELECTION_START_KEY, (new Date()).getTime());
    setTimeout(function endElection() {
      var candidates = self.store.getItem(ELECTION_KEY);
      candidates = candidates ? candidates.split(',') : [self.id];
      var winner = Math.max.apply(Math, candidates);
      self.store.setItem(CURRENT_KEY, winner);
      self.store.removeItem(ELECTION_KEY);
      self.store.removeItem(ELECTION_START_KEY);
      if (winner === self.id) {
        self.becomeMaster();
      }
    }, this.electionTime);
  };

  // -------------------------------------------------------------------------

  //
  // ## On Event
  //
  // Custom event emitter functionality. Attach a handler to the given event.
  //
  Browbeat.prototype.on = function browbeatEventOn(e, handler) {
    if (!this.listeners[e]) {
      this.listeners[e] = [];
    }

    this.listeners[e].push(handler);
  };

  //
  // ## Emit Event
  //
  // Emits an event to the registered listeners.
  //
  Browbeat.prototype.emit = function browbeatEventEmit(e, data) {
    if (!this.listeners[e]) return;
    data = data || {};
    data.eventName = e;
    for (var i in this.listeners[e]) {
      this.listeners[e][i](data);
    }
  };

  // -------------------------------------------------------------------------

  //
  // ## Broadcast
  //
  // Broadcast a message to _all_ windows, including the sender.
  //
  Browbeat.prototype.broadcast = function browbeatBroadcast(message) {
    this.emit('broadcast', message);
    this.sendMessage('broadcast', message);
  };

  //
  // ## Message Master
  //
  // Sends a message to the master only.
  //
  Browbeat.prototype.messageMaster = function browbeatMsgMaster(message) {
    if (this.isMaster) {
      this.emit('master', message);
    }
    else {
      this.sendMessage('master', message);
    }
  };

  //
  // ## Message Slaves
  //
  // Sends a message to the slaves only.
  //
  Browbeat.prototype.messageSlaves = function browbeatMsSlaves(message) {
    if (!this.isMaster) this.emit('slave', message);
    this.sendMessage('slave', message);
  };

  //
  // ## Send Message
  //
  // Sends a message on the "bus" to other tabs. The message is written to the
  // `localStorage`. The message will be garbage collected by the master at
  // some point.
  //
  Browbeat.prototype.sendMessage = function browbeatSend(message, data) {
    var msg = {
      message: message,
      data: data,
      timestamp: (new Date()).getTime()
    };

    var key = MSG_PREFIX + '~' + msg.timestamp + '~' + Math.random();
    this.store.setItem(key, JSON.stringify(msg));
  };

  // -------------------------------------------------------------------------

  //
  // ## Export Module
  //
  // Try to be a good citizen in whatever environment we find ourselves.
  //
  (function () {
    var hasDefine = typeof define === 'function' && define.amd;
    var hasExport = typeof exports !== 'undefined';

    if (hasDefine) {
      define('Browbeat', Browbeat);
    }
    else if (hasExport) {
      exports = Browbeat;
    }
    else {
      window.Browbeat = Browbeat;
    }
  }());
}());

