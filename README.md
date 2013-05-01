$do reference (AsyncContext)
============================

Used to perform asynchronous operations.

General idea
------------
$do provides ability for developer write "synchronous looks like" code which is actually asynchronous.
For example code like:
```js
loadSomeData(
  function(result) {
    var someResult = result;
    loadSomeOtherData(
      function (result) {
        var someOtherResult = result;
        alert(someResult + someOtherResult);
      }
    )
  }
)
```
can be re-written in $do way:
```js
var someResult;;
var someOtherResult;

$do(loadSomeResult);
$do(loadSomeOtherResult);
$do(showResults);

function loadSomeResult(callback) {
  loadSomeData(
    function (result) {
      someResult = result;
      callback();
    }
  );
}

function loadSomeOtherResult(callback) {
  loadSomeOtherData(
    function (result) {
      someOtherResult= result;
      callback();
    }
  );
}

function showResults() {
  alert(someResult + someOtherResult);
}
```
It takes more lines, but provides next advantages:  
*  Order of instructions can be easily changed
*  Instructions are independent one from another
*  If you would like to load all data in parallel it can be easily implemented:  

```js
$do(loadSomeResult, loadSomeOtherResult);
```

*  All actions is small functions with readable names

Basic usage
-----------

To create $do object:

```js
var $do = new AsyncContext();
```

To launch asynchronous function one after another:
```js
$do(async_func1);
$do(async_func2);
$do(async_func3);
```
To launch asynchronous functions all together:

```js
$do(async_func1, async_func2, async_func3);
```

To launch asynchronous functions in parallel and after they done execute synchronous function:

```js
$do(async_func1, async_func2, async_func3);
$do(sync_func1);
```

Requirements and restrictions
-----------------------------

All functions used with $do should comply with next restrictions:  
*  If function is synchronous it shouldn’t have any arguments
*  If function is asynchronous it should have one and only one argument "callback". It should call it when work is done.

```js
$do(pause);
$do(sayHello);

//synchronous function
function sayHello() {
  alert("Hello World!");
}

//asynchronous function
function pause(callback) {
  setTimeout(callback, 1000);
}
```

If you need to pass some parameters to function use wrapper function.  
If you don’t need any parameters you can use it inline:

```js
//wrapper function: with parameter ("Hello World!")
$do(sayHello);

function sayHello() {
  alert("Hello World!");
}
//inline: no parameters
$do(navigator.pop);
```

*Note: You can have as many $do calls as you like, but if you used $do at some line of function, all rest of it should be wrapped in $do.*

```js
//incorrect usage
sync_fync1();
$do(async_func1);
$do(async_func2);
sync_func2(); //will be executed before async_func1 and async_func2

//correct usage
sync_fync1();
$do(async_func1);
$do(async_func2);
$do(sync_func2); //will be executed after async_func1 and async_func2
```

At same time if/else and for statements are not restricted:

```js
//correct usage
sync_fync1();

for (var i=0;i<10;i++) {
  $do(async_func1);
}

if (condition) { //condition will be calculated before async_func1!
  $do(async_func2);
} else {
  $do(sync_func2);
}
```

*Note: while if statements are not restricted, condition will be calculated BEFORE thread execution, so if it will be changed later - it will not have effect. So, you can use if statement that way, only if condition is constant during all time of execution. For cases when condition changes see $do.$if construction below.*  

Nested $do cannot be splitted:
```js
$do(func1);
function func1() {
  $do(func2);
  function func2() {
    setTimeout(func3, 1000);
    function func3() {
      $do(func4); //will be executed in wrong context:
                   //func2 doesn’t use $do to wrap functions
    }
  }
}
```

Can be rewritten:
```js
$do(func1);
function func1() {
  $do(func2);
  function func2() {
    $do(pause);
    $do(func3);                
    function pause(callback) {
      setTimeout(callback, 1000); //Last function in chain
      //can be without $do
    }
    function func3() {
      $do(func4);
    }
  }
}
```

If your function used only to launch nested functions you don’t need to use callback:
```js
$do(func1);

function func1(callback) {
  $do(func2);
  $do(func3);
  $do(callback);
}
```

is equivalent for:
```js
$do(func1);

function func1() {
  $do(func2);
  $do(func3);
}        
```

Nested $do
----------
The real power of $do is possibility to use nested $do:
```js
$do(async_func1, nested1);
$do(sync_fync1);

function nested1() {
  $do(nested2);
  $do(async_func2, async_func3);
  $do(sync_func2);
  function nested2() {
    $do(async_func4, async_func5, async_func6);
  }
}
```

Fig. Execution flow  
You can create as complicated sequence of calls as you like and have precision control of execution flow.

$do.$if
-------

In case when you flow depends on some condition you may use $do.$if statement.  
It is analog for regular javascript if statement, but calculates condition when thread reach $do.$if statement.
```js
$do.$if(condition) (
  func_if_condition_true
)[.$else(
  func_if_condition_false
)]
```

*condition* can be:
*  variable
   In this case $do.$if can be replaced with regular if-else statement
*  synchronous function
   It should return condition value.
*  asynchronous function
   It should callback condition value

*func_if_condition_true*: single asynchronous or synchronous function

*func_if_condition_false*: single asynchronous or synchronous function

Usage of $else statement is optional.

Example of all possible types of conditions:
```js
var a=true;

if (a) {
  $do(async_func1);
} else {
  $do(async_func2);
}
//is equivalent for
$do.$if(a) (
  async_func1
).$else (
  async_func2
)
//case when condition is calculated synchronously before $if
var b;
$do(calculateB);
$do(isBTrue) (
  async_func1
).$else(
  async_func2
)
function calculateB() {
  b=true;
}
function isBTrue() {
  return b;
}
//case when condition calculated asynchronously
$do(isCTrue) (
  async_func1
).$else(
  async_func2
);
function isCTrue(callback) {
  setTimeout(
    function () {
        callback(true);
    },
    1000
  )
}
```

$do.forEachSync
---------------
Analog of for statement, but asynchronous. All elements processed one after another.
```js
$do.forEachSync(elements)(
  func_element_handler
)
```

*  *elements* : can be Array or Object.
   In case of Array all elements will be passed to func_element_handler.
   In case of Object all properties values will be passed to  func_element_handler.
*  *func_element_handler*:
   asynchronous function with two arguments: item and callback.

```js
var elements = [ 1, 2, 3 ];
var sum = 0;
$do.forEachSync(elements)(
  slowSum
);
$do(displayResult);
function slowSum(item, callback) {
  setTimeout(
    function () {
      sum += item;
      callback();        
    },
    1000
  )
}
function displayResult() {
        alert(sum); //should equals 6
}
```

$do.forEachAsync
----------------

Same as $do.forEachSync (see above), but all elements processed in parallel.

$do.sync
--------

Takes list of functions as arguments and execute them one after another:
```js
$do.sync(func1, func2, func3);
```

equivalent for:
```js
$do(func1);
$do(func2);
$do(func3);
```

$do.terminate (Advanced)
------------------------
Stops execution of thread immediately.  
Can be called at any nested level and will stop whole thread.
```js
$do.terminate();
```

$do.inline (Advanced)
---------------------
It is useful for using with $do.$if statement.  
Since $if takes only one function for true condition and one for false condition you cannot execute list of functions inside $if, but sometimes you need.   
It can be done two ways:

*  Introduce sub function
*  use $do.inline

```js
$do(loadRule);
$do.$if(isRuleExists)(
  $do.sync.inline(
    loadRecipient,
    renderRule
  )
);
```

is equals to:
```js
$do(loadRule);
$do.$if(isRuleExists)(
  loadRecipientAndRenderRule
);
function loadRecipientAndRenderRule() {
  $do(loadRecipient);
  $do(renderRule);
}
```

and equals to:
```js
$do(loadRule);
$do.$if(isRuleExists)(
  function () {
    $do(loadRecipient);
    $do(renderRule);
  }
);
```

You can use inline with next methods of $do:
```js
$do.inline
$do.sync.inline
$do.forEachSync.inline
$do.forEachAsync.inline
$do.withParams (Advanced)
```

If you need to call some function inside $do with params, but you don’t want to introduce wrapper function you can use $do.withParams:
```js
$do(pause);
$do(sayHello);
function pause(callback) {
  setTimeout(callback, 1000);
}
function sayHello() {
  alert("Hello World!");
}
```

is equals to:
```js
$do(pause);
$do (
  $do.withParams(alert, "Hello World!")
);
function pause(callback) {
  setTimeout(callback, 1000);
}
```

$do.withParams takes function as first argument and function arguments list, as second and so on arguments.  
*Note: Only synchronous functions (without "callback" argument) can be called inside $do.withParams, because there is now way to pass "callback" argument into that function, but they can contain other $do instructions inside, to perform asynchronous operations.*

Nested $if (Advanced)
---------------------
There are no inline nested $if possibility. But nested ifs can be wrapped into functions:
```js
$do.$if(isRandomCondition)(
  function () {
    $do.$if(isRandomCondition) (
      $do.withParams(alert, "1 and 2 is true")
    ).$else (
      $do.withParams(alert, "1 is true, 2 - false")
    )
  }
).$else (
  $do.withParams(alert, "1 is false, 2 - not checked")        
)

function isRandomCondition(callback) {
  setTimeout(
    function () {
        callback(Math.random() > 0.5);
    },
    1000
  );
}

