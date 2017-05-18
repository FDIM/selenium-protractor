var handlers = {};
var locator = require('./locators').get;
var getter = require('./getters').get;

module.exports = {
    handlers: handlers,
    register: registerHandler,
    expectation: expectation
};

function registerHandler(type, fn, scoped, closeBlockBefore) {
    handlers[type] = fn;
    fn.type = type;
    fn.scoped = scoped;
    fn.closeBlockBefore = closeBlockBefore;
}

function expectation(value, valueType, formatter, message, negate) {
    var res = '', part;
    if (!value) {
        value = '';
    }
    // negate
    if (value.indexOf('!') === 0) {
        value = value.substring(1);
        res += 'not.';
    }
    // negate
    if (negate) {
        res += 'not.';
    }
    if (valueType === 'boolean') {
        res += "toBe(";
        if (value === '') {
            res += 'true';
        } else if (/true|false/.test(value)) {
            res += value;
        } else {
            res += formatter.expression(value);
        }
        res += "," + formatter.quote(message, true) + ");";
    } else if (value.indexOf('regexp:') === 0) {
        res += "toMatch(" + toMatchParam(value.substring(7)) + "," + formatter.quote(message, true) + ");";
    } else if (value.indexOf('regexpi:') === 0) {
        res += "toMatch(" + toMatchParam(value.substring(8), 'i') + "," + formatter.quote(message, true) + ");";
    } else {
        var matcher = 'toEqual(';
        if (value.indexOf('<') === 0) {
            matcher = 'toBeLessThan(';
            value = value.substring(1);
        } else if (value.indexOf('>') === 0) {
            matcher = 'toBeGreaterThan(';
            value = value.substring(1);
        }
        res += matcher + (valueType === 'number' && /^[\d]+|[\d]+\.[\d]+$/.test(value) ? value : formatter.expression(value)) + "," + formatter.quote(message, true) + ");";
    }
    return res;

    function toMatchParam(expr, modifiers) {
        if (expr.indexOf('/') === 0) {
            return expr;
        } else {
            return "new RegExp(" + formatter.quote(expr, true) + (modifiers ? ",'" + modifiers + "'" : '') + ")";
        }
    }
}

// supported handlers
registerHandler('default', (cmd, formatter) => {
    if (cmd.type) {
        console.error('command "' + cmd.type + '" is not supported');
        return "fail(" + formatter.quote('command ' + cmd.type + ' is not supported') + ");" + formatter.endOfLine
    } else {
        return formatter.endOfLine;
    }
});

registerHandler('defaultassert', (cmd, formatter) => {
    var negate = cmd.type.indexOf('assertNot') === 0;
    var length = negate ? 'assertnot'.length : 'assert'.length;
    var variable = cmd.type.substring(length, length + 1).toLowerCase() + cmd.type.substring(length + 1);
    var get = getter(variable);
    // special case for attribute accessor
    if (variable === 'attribute') {
        var parts = cmd.locator.split('@');
        variable = parts.pop();
        cmd.locator = parts.join('@');
    }
    var res = [];
    if (get.inBrowserContext && !cmd.locator) {
        //executeAsyncScript passes callback as last argument, thus arguments[arguments.length - 1]
        res.push("browser.executeAsyncScript('arguments[arguments.length - 1](document.documentElement" + get(variable, formatter) + " || document.body" + get(variable, formatter) + ")')" + ".then(function (_value) {" + formatter.endOfLine);
    } else if (get.inBrowserContext) {
        //executeAsyncScript passes callback as last argument, thus arguments[arguments.length - 1]
        res.push("browser.executeAsyncScript('arguments[arguments.length - 1](arguments[0]" + get(variable, formatter) + ")', " + locator(cmd.locator, formatter) + ".getWebElement())" + ".then(function (_value) {" + formatter.endOfLine);
    } else {
        res.push(locator(cmd.locator, formatter, get.isMulti) + get(variable, formatter) + ".then(function (_value) {" + formatter.endOfLine);
    }
    res.push(formatter.whitespace + "expect(_value)." + expectation(cmd.value, get.valueType, formatter, formatter.stringifyCommand(cmd), negate) + formatter.endOfLine);
    return res;
}, true);

registerHandler('defaultverify', (cmd, formatter) => {
    // pass through
    return handlers['default'](cmd, formatter);
});

registerHandler('defaultstore', (cmd, formatter) => {
    var length = 'store'.length;
    var variable = cmd.type.substring(length, length + 1).toLowerCase() + cmd.type.substring(length + 1);
    var get = getter(variable);
    var res = [];
    // special case for attribute accessor
    if (variable === 'attribute') {
        var parts = cmd.locator.split('@');
        variable = parts.pop();
        cmd.locator = parts.join('@');
    }
    if (get.inBrowserContext && !cmd.locator) {
        //executeAsyncScript passes callback as last argument, thus arguments[arguments.length - 1]
        res.push("browser.executeAsyncScript('arguments[arguments.length - 1](document.documentElement" + get(variable, formatter) + " || document.body" + get(variable, formatter) + ")')" + ".then(function (_value) {" + formatter.endOfLine);
    } else if (get.inBrowserContext) {
        //executeAsyncScript passes callback as last argument, thus arguments[arguments.length - 1]
        res.push("browser.executeAsyncScript('arguments[arguments.length - 1](arguments[0]" + get(variable, formatter) + ")', " + locator(cmd.locator, formatter) + ".getWebElement())" + ".then(function (_value) {" + formatter.endOfLine);
    } else {
        res.push(locator(cmd.locator, formatter, get.isMulti) + get(variable, formatter) + ".then(function (_value) {" + formatter.endOfLine);
    }

    res.push(formatter.whitespace + cmd.value + " = _value;" + formatter.endOfLine);

    return res;
}, true);

registerHandler('store', (cmd, formatter) => {
    return cmd.value + ' = ' + locator(cmd.locator, formatter) + ';' + formatter.endOfLine;
});

registerHandler('assertlocation', (cmd, formatter) => {
    return 'expect(browser.getCurrentUrl()).' + expectation(cmd.value || cmd.locator, 'string', formatter, cmd.type + '|' + cmd.locator + '|' + cmd.value) + formatter.endOfLine;
});
registerHandler('assertnotlocation', (cmd, formatter) => {
    return 'expect(browser.getCurrentUrl()).' + expectation(cmd.value || cmd.locator, 'string', formatter, cmd.type + '|' + cmd.locator + '|' + cmd.value, true) + formatter.endOfLine;
});

registerHandler('storelocation', (cmd, formatter) => {
    return [
        'browser.getCurrentUrl().then(function (_location){' + formatter.endOfLine,
        formatter.whitespace + cmd.value + " = _location;" + formatter.endOfLine
    ];
}, true);

registerHandler('asserttitle', (cmd, formatter) => {
    return 'expect(browser.getTitle()).' + expectation(cmd.value, 'string', formatter, cmd.type + '|' + cmd.locator + '|' + cmd.value) + formatter.endOfLine;
});

registerHandler('assertnottitle', (cmd, formatter) => {
    return 'expect(browser.getTitle()).' + expectation(cmd.value, 'string', formatter, cmd.type + '|' + cmd.locator + '|' + cmd.value, true) + formatter.endOfLine;
});

registerHandler('storetitle', (cmd, formatter) => {
    return [
        'browser.getTitle().then(function (_title){' + formatter.endOfLine,
        formatter.whitespace + cmd.value + " = _title;" + formatter.endOfLine
    ];
}, true);

['alert', 'confirmation', 'prompt'].forEach((type) => {

    registerHandler('assert' + type, (cmd, formatter) => {
        return [
            'expect(browser.switchTo().alert().getText()).' + expectation(cmd.locator || cmd.value, 'string', formatter, formatter.stringifyCommand(cmd)) + formatter.endOfLine,
            'browser.switchTo().alert().accept();' + formatter.endOfLine

        ];
    });
    registerHandler('assertnot' + type, (cmd, formatter) => {
        return [
            'expect(browser.switchTo().alert().getText()).' + expectation(cmd.locator || cmd.value, 'string', formatter, formatter.stringifyCommand(cmd), true) + formatter.endOfLine,
            'browser.switchTo().alert().accept();' + formatter.endOfLine

        ];
    });

    registerHandler('store' + type, (cmd, formatter) => {
        return [
            'browser.switchTo().alert().getText().then(function (_value){' + formatter.endOfLine,
            formatter.whitespace + cmd.value + " = _value;" + formatter.endOfLine,
            formatter.whitespace + 'browser.switchTo().alert().accept();' + formatter.endOfLine
        ];
    }, true);
});

registerHandler('it', (cmd, formatter) => {
    return (cmd.skip ? 'xit' : 'it') + "(" + formatter.quote(cmd.value) + ", function() {" + formatter.endOfLine.repeat(2);
}, true, true);

registerHandler('desc', (cmd, formatter) => {
    return (cmd.skip ? 'xdescribe' : 'describe') + "(" + formatter.quote(cmd.value) + ", function() {" + formatter.endOfLine.repeat(2);
}, true);

registerHandler('export', (cmd, formatter) => {
    return "module.exports = (function(config, data) {" + formatter.endOfLine.repeat(2);
}, true);

registerHandler('breakif', (cmd, formatter) => {
    return [
        'if (' + cmd.value + ') {' + formatter.endOfLine,
        formatter.whitespace + 'return;' + formatter.endOfLine,
        '}' + formatter.endOfLine
    ];
});

registerHandler('continueif', (cmd, formatter) => {
    return [
        'if (!(' + cmd.value + ')) {' + formatter.endOfLine,
        formatter.whitespace + 'return;' + formatter.endOfLine,
        '}' + formatter.endOfLine
    ];
});

registerHandler('callback', (cmd, formatter) => {
    var fn = cmd.value;
    var hasBracket = fn.indexOf('(') !== -1;
    if (hasBracket) {
        fn = fn.substring(0, fn.indexOf('('));
    }
    var result = [
        'if (typeof ' + fn + ' === "function") {' + formatter.endOfLine,
        formatter.whitespace + cmd.value + (hasBracket ? ';' : '();') + formatter.endOfLine,
        '} else {' + formatter.endOfLine,
        formatter.whitespace + 'console.info("' + fn + ' is not a function");' + formatter.endOfLine,
        '}' + formatter.endOfLine
    ];
    // special case as this code is put outside of `it` block
    if (cmd.skip) {
        result.unshift('/* callback is intentionally skipped' + formatter.endOfLine);
        result.push('*/' + formatter.endOfLine);
    }
    return result;
}, false, true);

registerHandler('click', (cmd, formatter) => {
    return [
        handlers['focus'](cmd, formatter),
        locator(cmd.locator, formatter) + ".click().then(function(){},function(err){fail(err+\"\\ncommand: \"+" + formatter.quote(formatter.stringifyCommand(cmd), true) + ");});" + formatter.endOfLine.repeat(2)
    ];
});

registerHandler('mousedown', (cmd, formatter) => {
    return [
        handlers['focus'](cmd, formatter),
        'browser.actions().mouseDown(' + locator(cmd.locator, formatter) + ").perform().then(function(){},function(err){fail(err+\"\\ncommand: \"+" + formatter.quote(formatter.stringifyCommand(cmd), true) + ");});" + formatter.endOfLine.repeat(2)
    ];
});

registerHandler('enablesynchronization', (cmd, formatter) => {
    return "browser.ignoreSynchronization = false;" + formatter.endOfLine;
});

registerHandler('disablesynchronization', (cmd, formatter) => {
    return "browser.ignoreSynchronization = true;" + formatter.endOfLine;
});

registerHandler('pause', (cmd, formatter) => {
    return "browser.pause();" + formatter.endOfLine;
});

registerHandler('refresh', (cmd, formatter) => {
    return "browser.refresh();" + formatter.endOfLine;
});

registerHandler('echo', (cmd, formatter) => {
    return "console.info(" + formatter.quote(cmd.value || cmd.locator, true) + ");" + formatter.endOfLine;
});

registerHandler('submit', (cmd, formatter) => {
    return [
        locator(cmd.locator, formatter) + ".submit();" + formatter.endOfLine.repeat(2)
    ];
});

registerHandler('clear', (cmd, formatter) => {
    return [
        locator(cmd.locator, formatter) + ".clear();" + formatter.endOfLine.repeat(2)
    ];
});

registerHandler('type', (cmd, formatter) => {
    // EMP-8465 is meant to refactor/extend this a bit
    return [
        locator(cmd.locator, formatter) + ".sendKeys(" + formatter.expression(cmd.value) + ");" + formatter.endOfLine
    ];
});
registerHandler('sendkeys', (cmd, formatter) => {
    return [
        locator(cmd.locator, formatter) + ".sendKeys(" + formatter.expression(cmd.value) + ");" + formatter.endOfLine
    ];
});

registerHandler('select', (cmd, formatter) => {
    var value = cmd.value;
    var optionSelector;
    if (value.indexOf('label=') === 0) {
        value = cmd.value.substring('label='.length);
    }
    if (value.indexOf('index=') === 0) {
        value = cmd.value.substring('index='.length);
        optionSelector = "by.css(`option:nth-child(" + (parseInt(value) + 1) + ")`)";
    } else if (value.indexOf('value=') === 0) {
        value = cmd.value.substring('value='.length);
        optionSelector = "by.css(`option[value='" + value + "']`)";
    } else if (value.indexOf('id=') === 0) {
        value = cmd.value.substring('id='.length);
        optionSelector = "by.css(`option[id='" + value + "']`)";
    } else {
        optionSelector = "by.cssContainingText('option'," + formatter.expression(value) + ")";
    }
    return locator(cmd.locator, formatter) + ".element(" + optionSelector + ").click();" + formatter.endOfLine;
});

registerHandler('selectframe', (cmd, formatter) => {
    var list = [];
    if (cmd.locator === 'relative=top' || !cmd.locator) {
        list.push("browser.switchTo().defaultContent().then(function (){" + formatter.endOfLine);
        list.push(formatter.whitespace + "browser.ignoreSynchronization = false;" + formatter.endOfLine);
    } else {
        list.push("browser.ignoreSynchronization = true;" + formatter.endOfLine);
        list.push("browser.switchTo().frame(" + locator(cmd.locator, formatter) + ".getWebElement()).then(function (){" + formatter.endOfLine);
    }
    return list;
}, true);

registerHandler('open', (cmd, formatter) => {
    return "browser.get(" + formatter.expression(cmd.locator || cmd.value) + ");" + formatter.endOfLine;
});

registerHandler('sleep', (cmd, formatter) => {
    return "browser.sleep(" + (cmd.value * 1 || 1000) + ");" + formatter.endOfLine;
});

registerHandler('focus', (cmd, formatter) => {
    return "browser.executeScript('arguments[0].scrollIntoView(false);', " + locator(cmd.locator, formatter) + ".getWebElement());" + formatter.endOfLine;
});

registerHandler('scrollto', (cmd, formatter) => {
    var values = cmd.value.split(',');
    var left, top;
    if (values.length === 1) {
        left = 0;
        top = values[0];
    } else {
        left = values[0];
        top = values[1];
    }
    if (cmd.locator) {
        return "browser.executeScript(`arguments[0].scrollTop = " + top + ";arguments[0].scrollLeft = " + left + ";`, " + locator(cmd.locator, formatter) + ".getWebElement());" + formatter.endOfLine;
    } else {
        return "browser.executeScript(`document.documentElement.scrollTop = document.body.scrollTop = " + top + ";document.documentElement.scrollLeft = document.body.scrollLeft = " + left + ";`);" + formatter.endOfLine;
    }
});

registerHandler('scrollby', (cmd, formatter) => {
    var values = cmd.value.split(',');
    var left, top;
    if (values.length === 1) {
        left = 0;
        top = values[0];
    } else {
        left = values[0];
        top = values[1];
    }
    if (cmd.locator) {
        return "browser.executeScript(`arguments[0].scrollTop += " + top + ";arguments[0].scrollLeft += " + left + ";`, " + locator(cmd.locator, formatter) + ".getWebElement());" + formatter.endOfLine;
    } else {
        return "browser.executeScript(`document.documentElement.scrollTop +=" + top + "; document.body.scrollTop += " + top + ";document.documentElement.scrollLeft += " + left + "; document.body.scrollLeft += " + left + ";`);" + formatter.endOfLine;
    }
});

registerHandler('eval', (cmd, formatter) => {
    if (cmd.locator) {
        var value = 'var element = arguments[0];' + cmd.value;
        return "browser.executeScript(" + formatter.quote(value, true) + "," + locator(cmd.locator, formatter) + ".getWebElement());" + formatter.endOfLine;
    } else {
        return "browser.executeScript(" + formatter.quote(cmd.value, true) + ");" + formatter.endOfLine;
    }
});

registerHandler('storeeval', (cmd, formatter) => {
    return [
        "browser.executeScript('return ' + " + formatter.quote(cmd.locator, true) + ").then(function(_value){" + formatter.endOfLine,
        formatter.whitespace + cmd.value + " = _value;" + formatter.endOfLine,
    ];
}, true);

// TODO: should support more waitFor* commands
registerHandler('waitforelementpresent', (cmd, formatter) => {
    return "browser.wait(protractor.ExpectedConditions.presenceOf(" + locator(cmd.locator, formatter) + "), " + (cmd.value || 2000) + "," + formatter.quote(formatter.stringifyCommand(cmd), true) + ");" + formatter.endOfLine;
});
registerHandler('waitforelementnotpresent', (cmd, formatter) => {
    return "browser.wait(protractor.ExpectedConditions.stalenessOf(" + locator(cmd.locator, formatter) + "), " + (cmd.value || 2000) + "," + formatter.quote(formatter.stringifyCommand(cmd), true) + ");" + formatter.endOfLine;
});

registerHandler('waitforvisible', (cmd, formatter) => {
    return "browser.wait(protractor.ExpectedConditions.visibilityOf(" + locator(cmd.locator, formatter) + "), " + (cmd.value || 2000) + "," + formatter.quote(formatter.stringifyCommand(cmd), true) + ");" + formatter.endOfLine;
});

registerHandler('waitfornotvisible', (cmd, formatter) => {
    return "browser.wait(protractor.ExpectedConditions.invisibilityOf(" + locator(cmd.locator, formatter) + "), " + (cmd.value || 2000) + "," + formatter.quote(formatter.stringifyCommand(cmd), true) + ");" + formatter.endOfLine;
});

registerHandler('waitfortext', (cmd, formatter) => {
    return "browser.wait(protractor.ExpectedConditions.textToBePresentInElement(" + locator(cmd.locator, formatter) + "," + formatter.expression(cmd.value) + "), 5000, " + formatter.quote(formatter.stringifyCommand(cmd), true) + ");" + formatter.endOfLine;
});

registerHandler('waitfornottext', (cmd, formatter) => {
    return "browser.wait(protractor.ExpectedConditions.not(protractor.ExpectedConditions.textToBePresentInElement(" + locator(cmd.locator, formatter) + "," + formatter.expression(cmd.value) + ")), 5000, " + formatter.quote(formatter.stringifyCommand(cmd), true) + ");" + formatter.endOfLine;
});

registerHandler('waitforvalue', (cmd, formatter) => {
    return "browser.wait(protractor.ExpectedConditions.textToBePresentInElementValue(" + locator(cmd.locator, formatter) + "," + formatter.expression(cmd.value) + "), 5000, " + formatter.quote(formatter.stringifyCommand(cmd), true) + ");" + formatter.endOfLine;
});

registerHandler('waitfornotvalue', (cmd, formatter) => {
    return "browser.wait(protractor.ExpectedConditions.not(protractor.ExpectedConditions.textToBePresentInElementValue(" + locator(cmd.locator, formatter) + "," + formatter.expression(cmd.value) + ")), 5000, " + formatter.quote(formatter.stringifyCommand(cmd), true) + ");" + formatter.endOfLine;
});
