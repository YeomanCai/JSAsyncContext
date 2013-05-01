function AsyncContext(contextCallback, parentContext) {
    var commandsStack = [];
    var commandPointer = -1;
    var asyncCommandsRunning = 0;
    var isIdle = true;
    var isSwitchedToChildContext = false;
    var isTerminated = false;
    var childContext;
    var self = run;

    contextCallback = contextCallback || function () {};

    var commandType = {
        LINE: "LINE",
        IF: "IF",
        IF_CONDITION: "IF_CONDITION",
        CALLBACK: "CALLBACK"
    };

    self.$if = function () {
        if (isSwitchedToChildContext) {
            return childContext.$if.apply(this, arguments);
        } else {
            return asyncIf.apply(this, arguments);
        }
    };

    self.forEachSync = function () {
        if (isSwitchedToChildContext) {
            return childContext.forEachSync.apply(this, arguments);
        } else {
            return getForEachFunction(true).apply(this, arguments);
        }
    };

    self.forEachAsync = function () {
        if (isSwitchedToChildContext) {
            return childContext.forEachAsync.apply(this, arguments);
        } else {
            return getForEachFunction(false).apply(this, arguments);
        }
    };

    self.callback = function () {
        if (isSwitchedToChildContext) {
            return childContext.callback.apply(this, arguments);
        } else {
            return runCallback.apply(this);
        }
    };

    self.sync = function () {
        if (isSwitchedToChildContext) {
            return childContext.sync.apply(this, arguments);
        } else {
            var commands = Array.prototype.slice.call(arguments);
            addCommands(commands, true);
        }
    };

    self.terminate = function () {
        if (isSwitchedToChildContext) {
            childContext.terminate();
        } else {
            if (!isTerminated) {
                terminate();
                if (isParentContextExists() &&
                    typeof parentContext.terminate == 'function') {

                    parentContext.terminate();
                }
            }
        }
    };

    self.switchParentContext = function (context) {
        if (isParentContextExists() &&
            typeof parentContext.switchParentContext == 'function') {

            parentContext.switchParentContext(self);
        }
        isSwitchedToChildContext = true;
        childContext = context;
    };

    self.withParams = function () {
        var args = Array.prototype.slice.call(arguments);
        return function () {
            var func = args[0];
            func.apply(this, args.splice(1));
        }
    };

    addInlineCapability(self);
    addInlineCapability(self.sync);
    addInlineCapability(self.forEachSync);
    addInlineCapability(self.forEachAsync);

    return self;

    function addInlineCapability(func) {
        func.inline = function () {
            var args = Array.prototype.slice.call(arguments);
            return function () {
                func.apply(func, args);
            }
        }
    }

    function isParentContextExists() {
        return typeof parentContext != 'undefined' && parentContext !== null;
    }

    function run() {
        if (isSwitchedToChildContext) {
            childContext.apply(this, arguments);
        } else {
            var commands = Array.prototype.slice.call(arguments);
            if (commands.length == 1) {
                addCommands(commands, true);
            } else {
                addCommands(commands, false);
            }
        }
    }

    function runCallback() {
        commandsStack.push({
            type: commandType.CALLBACK,
            sync: true,
            completed: false,
            context: self
        });
        continueIfIdle();
    }

    function addCommands(commands, isSync) {
        for (var i = 0; i < commands.length; i++) {
            var command = commands[i];
            if (typeof command != 'function') {
                throw "[command] should be a function";
            }
            commandsStack.push({
                type: commandType.LINE,
                sync: isSync,
                command: command,
                completed: false,
                context: self
            });
        }
        if (!isSync) {
            commandsStack.push({
                type: commandType.LINE,
                sync: true,
                command: function(){},
                completed: false,
                context: self
            });
        }
        continueIfIdle();
    }

    function continueIfIdle() {
        if (isIdle) {
            isIdle = false;
            commandPointer++;
            executeCurrentCommand();
        }
    }

    function asyncIf(condition) {
        return function (commandIfTrue) {
            if (typeof commandIfTrue != 'function') {
                throw "[commandIfTrue] should be a function";
            }

            if (typeof condition == "function" && isAsyncFunction(condition)) {
                var conditionCommandRecord = {
                    type: commandType.IF_CONDITION,
                    sync: true,
                    command: condition,
                    completed: false,
                    context: self
                };
                commandsStack.push(conditionCommandRecord);
            }

            var commandRecord = {
                type: commandType.IF,
                sync: true,
                condition: condition,
                commandIfTrue: commandIfTrue,
                commandIfFalse: function () {},
                completed: false,
                context: self
            };

            commandsStack.push(commandRecord);

            immediatelyCall(continueIfIdle);

            return {
                $else: function (commandIfFalse) {
                    if (typeof commandIfFalse != 'function') {
                        throw "[commandIfFalse] should be a function";
                    }
                    commandRecord.commandIfFalse = commandIfFalse;
                }
            };
        }
    }

    function terminate() {
        isTerminated = true;
    }

    function getForEachFunction(isSync) {
        return function (items) {
            return function (itemHandler) {
                var commands = [];
                if (items.constructor === Array) {
                    commands = getCommandsFromArray(items);
                } else {
                    commands = getCommandsFromObject(items);
                }
                addCommands(commands, isSync);

                function getCommandsFromArray(items) {
                    var commands = [];
                    for (var i = 0; i < items.length; i++) {
                        var item = items[i];
                        commands.push(handler(item));
                    }
                    return commands;
                }

                function getCommandsFromObject(items) {
                    var commands = [];
                    for (var itemProp in items) {
                        if (items.hasOwnProperty(itemProp)) {
                            var item = items[itemProp];
                            commands.push(handler(item));
                        }
                    }
                    return commands;
                }

                function handler(item) {
                    return function (callback) {
                        itemHandler(item, callback);
                    }
                }
            };
        }
    }

    function executeCurrentCommand() {
        if (!isTerminated) {
            var currentCommandRecord = commandsStack[commandPointer];
            var currentType;
            if (typeof currentCommandRecord != 'undefined') {
                currentType = currentCommandRecord.type;
            }

            switch (currentType) {
                case commandType.LINE:
                case commandType.IF_CONDITION:
                case commandType.IF:
                    if (currentCommandRecord.sync) {
                        executeCommandSynchronously(currentCommandRecord);
                    } else {
                        executeCommandAsynchronously(currentCommandRecord);
                    }
                    break;
                case commandType.CALLBACK:
                    executeContextCallback(currentCommandRecord);
                    break;
                default:
                    commandPointer = commandsStack.length - 1;
                    isIdle = true;
            }
        }
    }

    function executeContextCallback(currentCommandRecord) {
        if (asyncCommandsRunning === 0) {
            if (!currentCommandRecord.completed) {
                contextCallback();

                currentCommandRecord.completed = true;
                commandPointer++;
                executeCurrentCommand();
            }
        }
    }

    function executeCommandSynchronously(currentCommandRecord) {
        if (asyncCommandsRunning === 0) {

            var type = currentCommandRecord.type;

            switchToChildContext(currentCommandRecord, syncCallback);

            if (type === commandType.LINE) {
                var command = convertToAsyncCommand(currentCommandRecord.command);
                command(syncCallback);
            } else if (type == commandType.IF_CONDITION) {
                currentCommandRecord.command(
                    function (conditionResult) {
                        if (commandPointer >= commandsStack.length) {
                            throw "if condition can not be last command";
                        } else {
                            var relatedIf = commandsStack[commandPointer+1];
                            if (relatedIf.type != commandType.IF) {
                                throw "related if should be after if condition";
                            } else {
                                relatedIf.condition = conditionResult;
                                syncCallback();
                            }
                        }
                    }
                )
            } else if (type === commandType.IF) {
                var conditionResult;
                if (typeof currentCommandRecord.condition == 'function') {
                    conditionResult = currentCommandRecord.condition();
                } else {
                    conditionResult = !!currentCommandRecord.condition;
                }
                if (conditionResult) {
                    convertToAsyncCommand(currentCommandRecord.commandIfTrue)(syncCallback);
                } else {
                    convertToAsyncCommand(currentCommandRecord.commandIfFalse)(syncCallback);
                }
            }

            switchBackFromChildContext();
        }

        function syncCallback() {
            if (!currentCommandRecord.completed) {
                currentCommandRecord.completed = true;
                commandPointer++;
                executeCurrentCommand();
            }
        }
    }

    function continueSynchronously() {
        if (asyncCommandsRunning === 0) {
            var currentCommandRecord = commandsStack[commandPointer];
            if (typeof currentCommandRecord != 'undefined') {
                if (currentCommandRecord.sync) {
                    executeCurrentCommand();
                }
            }
        }
    }

    function executeCommandAsynchronously(currentCommandRecord) {
        asyncCommandsRunning++;

        var command = convertToAsyncCommand(currentCommandRecord.command);

        switchToChildContext(currentCommandRecord, asyncCallback);

        command(asyncCallback);

        switchBackFromChildContext();

        commandPointer++;

        executeCurrentCommand();

        function asyncCallback() {
            if (!currentCommandRecord.completed) {

                currentCommandRecord.completed = true;
                asyncCommandsRunning--;

                continueSynchronously();
            }
        }
    }

    function switchToChildContext(currentCommandRecord, contextCallback) {
        self.switchParentContext(currentCommandRecord.context);

        childContext = new AsyncContext(contextCallback, self);
        isSwitchedToChildContext = true;
    }

    function switchBackFromChildContext() {
        isSwitchedToChildContext = false;
        childContext = undefined;
    }

    function convertToAsyncCommand(command) {
        if (isAsyncFunction(command)) {
            return command;
        } else {
            return function (callback) {
                command();
                self.callback();
            }
        }
    }

    function immediatelyCall(callback) {
        setTimeout(
            function () {
                callback.apply(self);
            }, 0
        );
    }

    function isAsyncFunction (func) {
        return func.length>0;
    }
}
