/**
    * Provides helper functions for handling output integrations.
    *
    * Written By:
    *              Matthew Knox
    *
    * License:
    *              MIT License. All code unless otherwise specified is
    *              Copyright (c) Matthew Knox and Contributors 2015.
    */

//const EventEmitter = require('events');

//class IntegrationLoader extends EventEmitter {
    
//    loadIntegration(descriptor) {
//        this.emit('load', descriptor);
//    }

//    unloadIntegration() {
        
//    }

//}

let files                   = require.once('../files.js'),
    fs                      = require('fs'),
    path                    = require('path'),
    cachedIntegrations      = null,
    selectedIntegrations    = null,
    started                 = false,
    eventSourceWrapper      = function (callback, name) {
        return function () {
            arguments[1].event_source = name;
            callback.apply(this, arguments);
        };
    };

global.shim = require.once('../shim.js');
global.shim.current = null;

exports.listIntegrations = function () {
    if (cachedIntegrations) {
        return cachedIntegrations;
    }
    let integ = files.filesInDirectory(global.__integrationsPath),
        list = [];
    integ.unshift('test');
    for (let i = 0; i < integ.length; i++) {
        let p = path.join(i === 0 ? global.rootPathJoin('core/integrations/') : global.__integrationsPath, integ[i]);
        try {
            let stat = fs.statSync(p);
            if (!stat.isDirectory()) {
                throw new Error($$`Integration must be .js file or directory.`);
            }

            let desc;
            try {
                desc = require.once(path.join(p, 'kassy.json'));
            }
            catch (e) {
                let pkg = require.once(path.join(p, 'package.json'));
                desc = {
                    name: pkg.name,
                    startup: path.join(p, pkg.main)
                };
            }
            if (!desc.name || !desc.startup) {
                throw new Error($$`Not enough information provided to describe integration.`);
            }
            desc.name = desc.name.replace(/ /g, '-').toLowerCase();
            desc.startup = path.join(p, desc.startup);
            list.push(desc);
        }
        catch (e) {
            console.error($$`Invalid integration installed (syntax error?).`);
            console.critical(e);
        }
    }
    cachedIntegrations = list;
    return list;
};

exports.setIntegrationConfigs = function (platform) {
    global.shim.current = platform;
    let outputConfig = platform.config.getSystemConfig('output');
    for (let i = 0; i < selectedIntegrations.length; i++) {
        selectedIntegrations[i].instance.platform = platform;
        if (outputConfig[selectedIntegrations[i].name] === void(0)) {
            outputConfig[selectedIntegrations[i].name] = {};
        }
        selectedIntegrations[i].instance.config = outputConfig[selectedIntegrations[i].name];

        for (let name in selectedIntegrations[i].instance.config) {
            if (name.startsWith('ENV_') && name === name.toUpperCase()) {
                process.env[name.substr(4)] = selectedIntegrations[i].instance.config[name];
            }
        }

        if (!selectedIntegrations[i].instance.config.commandPrefix) {
            selectedIntegrations[i].instance.config.commandPrefix = platform.defaultPrefix;
        }
    }
};

exports.setIntegrations = function (integrations) {
    if (selectedIntegrations) {
        throw new Error($$`Cannot change integrations when they are already set.`);
    }

    let i = 0;
    try {
        for (i = 0; i < integrations.length; i++) {
            integrations[i].instance = require.once(integrations[i].startup);

            if (integrations[i].instance.use) {
                integrations[i].instance = require.once('./hubot/robot.js').use(integrations[i].instance);
            }
        }
        selectedIntegrations = integrations;
        return true;
    }
    catch (e) {
        console.critical(e);
        console.error($$`Loading the output integration file '${integrations[i]}' failed.\n\n` +
            $$`If this is your file please ensure that it is syntactically correct.`);
        return false;
    }
};

exports.startIntegrations = function (callback) {
    if (!selectedIntegrations || selectedIntegrations.length === 0) {
        throw new Error($$`Integrations must be set before starting`);
    }

    if (started) {
        throw new Error($$`StartError`);
    }

    for (let i = 0; i < selectedIntegrations.length; i++) {
        process.nextTick(((integ) => {
            try {
                let wrapper = eventSourceWrapper(callback, integ.name);
                console.write($$`Loading integration '${integ.name}'...\t`);

                integ.instance.start(wrapper);
                console.info($$`[DONE]`);
            }
            catch (e) {
                console.error($$`[FAIL]`);
                console.debug($$`Failed to start output integration '${integ.name}'.`);
                console.critical(e);
            }
        }).bind(null, selectedIntegrations[i]));
    }

    started = true;
};

exports.stopIntegrations = function() {
    if (!started) {
        throw new Error($$`Cannot stop integrations if they haven't been started.`);
    }

    for (let i = 0; i < selectedIntegrations.length; i++) {
        try {
            console.write($$`Stopping integration '${selectedIntegrations[i].name}'...\t`);
            selectedIntegrations[i].instance.stop();
            selectedIntegrations[i].instance = null;
            console.info($$`[DONE]`);
        }
        catch (e) {
            console.error($$`[FAIL]`);
            console.debug($$`Failed to correctly stop output integration '${selectedIntegrations[i].name}'.`);
            console.critical(e);
        }
    }

    started = false;
    global.shim.current = null;
    global.shim = null;
};

exports.getSetIntegrations = function() {
    if (!selectedIntegrations) {
        throw new Error($$`Cannot get integrations if they have not already been set.`);
    }
    let integs = {};
    for (let i = 0; i < selectedIntegrations.length; i++) {
        integs[selectedIntegrations[i].name] = selectedIntegrations[i].instance;
    }
    return integs;
};
