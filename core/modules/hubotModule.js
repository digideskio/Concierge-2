/**
 * Provides helper functions for handling user and system modules.
 *
 * Written By:
 * 		Matthew Knox
 *
 * License:
 *		MIT License. All code unless otherwise specified is
 *		Copyright (c) Matthew Knox and Contributors 2015.
 */

var fs = require('fs'),
    path = require('path'),
    descriptor = 'hubot.json',
    pkg = 'package.json',
    Robot = require.once('./hubot/robot.js');

var verifyModuleDescriptior = function (hj) {
    if (!hj.name || !hj.startup || !hj.version) {
        return false;
    }
    return true;
};

exports.name = 'Hubot';

exports.verifyModule = function (location) {
    var stat = fs.statSync(location);
    if (!stat.isDirectory()) {
        return null;
    }

    var folderPath = path.resolve(location),
        desc = path.join(folderPath, './' + descriptor),
        pack = path.join(folderPath, './' + pkg),
        hj;

    try {
        fs.statSync(desc);
        hj = require.once(desc);
    }
    catch (e) {
        try {
            fs.statSync(pack);
            var p = require(pack);
            hj = Robot.generateHubotJson(folderPath, p.main);
            hj.name = p.name;
            hj.version = p.version;
        }
        catch (e) {
            var files = fs.readdirSync(folderPath);
            if (files.length !== 1) {
                return null;
            }
            hj = Robot.generateHubotJson(folderPath, files[0]);
        }

        fs.writeFileSync(desc, JSON.stringify(hj, null, 4), 'utf8');
    }

    if (!verifyModuleDescriptior(hj)) {
        return null;
    }

    if (!hj.folderPath) {
        hj.folderPath = folderPath;
    }
    return hj;
};

exports.loadModule = function (module, config) {
    try {
        var modulePath = module.folderPath,
            startPath = path.join(modulePath, module.startup),
            m = require.once(startPath);

        var cfg = config.loadConfig(modulePath, module.name);
        return new Robot(m, module, cfg);
    }
    catch (e) {
        console.critical(e);
        throw new Error($$`Could not load module '${module.name}'. Does it have a syntax error?`);
    }
};
