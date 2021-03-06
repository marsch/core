"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var _ = require("lodash");
var Promise = require("bluebird");
var platform_1 = require("./types/platform");
exports.PlatformMiddleware = platform_1.PlatformMiddleware;
var memory_1 = require("./storage/memory");
var default_reducer_1 = require("./default-reducer");
var nlp_1 = require("./nlp/nlp");
var script_1 = require("./script");
var outgoing_1 = require("./outgoing");
var DEFAULT_SCRIPT = '';
var defaultClassifierFile = process.env.CLASSIFIER_FILE ? process.env.CLASSIFIER_FILE : __dirname + "/../nlp/classifiers.json";
var Alana = (function () {
    function Alana(classifierFile) {
        if (classifierFile === void 0) { classifierFile = defaultClassifierFile; }
        this.debugOn = false;
        this.intents = [];
        this.platforms = [];
        // tslint:disable-next-line:variable-name
        this._scripts = {};
        this.onErrorScript = defaultErrorScript;
        var engine = new nlp_1.default(classifierFile);
        this.intents = [engine];
        this.reducer = default_reducer_1.default.bind(this);
        this.setUserMiddlware(new memory_1.default(this));
        return this;
    }
    Alana.prototype.addIntent = function (newIntent) {
        this.intents = [].concat(this.intents, newIntent);
        return this;
    };
    Alana.prototype.unshiftIntent = function (newIntent) {
        this.intents = [].concat(newIntent, this.intents);
        return this;
    };
    Alana.prototype.newScript = function (name) {
        if (name === void 0) { name = DEFAULT_SCRIPT; }
        var newScript = new script_1.default(this, name);
        this._scripts[name] = newScript;
        return newScript;
    };
    Alana.prototype.getScript = function (name) {
        if (name === void 0) { name = DEFAULT_SCRIPT; }
        return this._scripts[name];
    };
    Object.defineProperty(Alana.prototype, "scripts", {
        get: function () {
            return _.keys(this._scripts);
        },
        enumerable: true,
        configurable: true
    });
    Alana.prototype.addGreeting = function (script) {
        this.greetingScript = script;
        return this;
    };
    Alana.prototype.setReducer = function (newReducer) {
        this.reducer = newReducer.bind(this);
        return this;
    };
    Alana.prototype.setUserMiddlware = function (middleware) {
        this.userMiddleware = middleware;
        return this;
    };
    Alana.prototype.addPlatform = function (platform) {
        this.platforms.push(platform);
        return this;
    };
    Alana.prototype.addErrorHandler = function (dialog) {
        this.onErrorScript = dialog;
        return this;
    };
    Alana.prototype.turnOnDebug = function () {
        this.debugOn = true;
        return this;
    };
    Alana.prototype.createEmptyIntent = function () {
        return {
            action: null,
            details: {
                confidence: 0,
            },
            topic: null,
        };
    };
    Alana.prototype.createEmptyUser = function (defaults) {
        if (defaults === void 0) { defaults = {}; }
        var anEmptyUser = {
            _platform: null,
            conversation: [],
            id: null,
            platform: null,
            script: null,
            scriptStage: 0,
            scriptArguments: null,
            state: null,
        };
        return _.defaults(defaults, anEmptyUser);
    };
    Alana.prototype.start = function () {
        this.platforms.forEach(function (platform) { return platform.start(); });
    };
    Alana.prototype.stop = function () {
        this.platforms.forEach(function (platform) { return platform.stop(); });
    };
    Alana.prototype.processGreeting = function (user) {
        var greetingMessage = {
            type: 'greeting',
        };
        return this.processMessage(user, greetingMessage);
    };
    Alana.prototype.processMessage = function (basicUser, message) {
        var _this = this;
        var user = null;
        var request = null;
        var response = null;
        return this.userMiddleware.getUser(basicUser)
            .catch(function (err) { return _.merge(_this.createEmptyUser(), basicUser); })
            .then(function (completeUser) {
            completeUser._platform = basicUser._platform;
            completeUser.conversation = completeUser.conversation.concat(message);
            user = completeUser;
            response = new outgoing_1.default(_this, user);
            return completeUser;
        })
            .then(function (completeUser) { return _this.getIntents(completeUser, message); })
            .then(function (intents) { return _this.reducer(intents, user); })
            .then(function (intent) {
            request = {
                intent: intent,
                message: _.defaults({ _eaten: false }, message),
                user: user,
            };
            return _this._process(user, request, response, true);
        })
            .then(function () { return _this.userMiddleware.saveUser(user); })
            .then(function () { return; });
    };
    Alana.prototype.getIntents = function (user, message) {
        return Promise.map(this.intents, function (intent) { return intent.getIntents(message, user); })
            .then(_.flatten)
            .then(_.compact);
    };
    /**
     * @private
     * @param user The user initiating the chat
     * @param request All the incoming information about the current sessiom
     * @param response Class used to send responses back to the user
     * @param directCall True if being called by process(...) otherwise set to false to stop infinite loops
     */
    Alana.prototype._process = function (user, request, response, directCall) {
        var _this = this;
        if (directCall === void 0) { directCall = false; }
        return Promise.resolve()
            .then(function () {
            var blankScript = function () { return Promise.resolve(); };
            var nextScript = blankScript;
            // If there is a default script set that as the next script to run
            if (_this._scripts[DEFAULT_SCRIPT]) {
                nextScript = function () {
                    return this.scripts[DEFAULT_SCRIPT].run(request, blankScript);
                }.bind(_this);
            }
            if (request.message.type === 'greeting' && user.script === null && directCall === true) {
                if (_this.greetingScript) {
                    return Promise.resolve()
                        .then(function () { return _this.greetingScript(user, response); })
                        .then(function () {
                        if (_this._scripts[DEFAULT_SCRIPT]) {
                            return _this._scripts[DEFAULT_SCRIPT].run(request, response, blankScript, -1);
                        }
                    });
                }
                else {
                    user.script = null;
                    user.scriptStage = -1;
                }
            }
            if (user.script != null && user.script !== DEFAULT_SCRIPT && _this._scripts[user.script]) {
                return _this._scripts[user.script].run(request, response, nextScript);
            }
            else if (_this._scripts[DEFAULT_SCRIPT]) {
                return _this._scripts[DEFAULT_SCRIPT].run(request, response, blankScript, user.scriptStage);
            }
            else {
                // Confused what sript to run, may be an infinite loop?
                // If this is a greeting message just ignore it
                if (request.message.type === 'greeting') {
                    return;
                }
                return;
                // throw if we require a bot to respond
                // throw new Error('No idea how to chain the scripts');
            }
        })
            .catch(function (err) {
            if (err instanceof script_1.EndScriptException) {
                if (user.script === null) {
                    return;
                }
                user.script = null;
                user.scriptStage = -1;
                user.scriptArguments = {};
                return _this._process(user, request, response);
            }
            else if (err instanceof script_1.StopException) {
                if (err.reason === script_1.StopScriptReasons.NewScript) {
                    return _this._process(user, request, response);
                }
                return;
            }
            else {
                console.error('error caught');
                console.error(err);
                return _this.onErrorScript(request, response, script_1.stopFunction);
            }
        });
    };
    return Alana;
}());
exports.default = Alana;
var defaultErrorScript = function (incoming, response, stop) {
    response.sendText('Uh oh, something went wrong, can you try again?');
    return Promise.resolve();
};
//# sourceMappingURL=bot.js.map